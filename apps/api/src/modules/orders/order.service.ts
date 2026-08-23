import {
  ACTOR_TYPES,
  COUPON_AUDIT_ACTIONS,
  NOTIFICATION_CATEGORIES,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS,
  PRESCRIPTION_STATUS,
  STOCK_MOVEMENT_TYPES,
  resolveProductDefaults,
  type OrderStatus,
} from '@medcommerce/shared';
import mongoose, { type ClientSession } from 'mongoose';

import { logger } from '../../config/logger';
import { enqueueInvoiceGeneration } from '../../queues/queue';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { UserModel } from '../auth/models/user.model';
import { getBundleForCheckout, resolveProductAvailability } from '../catalog/bundle.service';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import type { CartLine } from '../coupons/coupon-discount-calculation.util';
import { recordCouponUsage, validateCouponForCart } from '../coupons/coupon-validation.service';
import { CouponModel } from '../coupons/models/coupon.model';
import { CartModel } from '../customers/models/cart.model';
import { CustomerAddressModel } from '../customers/models/customer-address.model';
import { PrescriptionUploadModel } from '../customers/models/prescription-upload.model';
import { getPrescriptionConfig } from '../customers/prescription-config.service';
import { calculateShippingCharge } from '../delivery/shipping-calculation.service';
import { BatchModel } from '../inventory/models/batch.model';
import { StockMovementModel } from '../inventory/models/stock-movement.model';
import { WarehouseModel } from '../inventory/models/warehouse.model';
import { InvoiceModel } from '../invoices/models/invoice.model';
import { enqueueNotification, notifyAdmins } from '../notifications/notification.service';
import { PaymentModel } from '../payments/models/payment.model';
import { RefundModel } from '../payments/models/refund.model';
import { getConfiguration } from '../platform/configuration.service';
import { publishInventoryUpdate } from '../realtime/inventory-events';
import { SellerModel } from '../sellers/models/seller.model';

import { OrderModel, type OrderDocument } from './models/order.model';
import { ReturnModel } from './models/return.model';
import { ShipmentModel } from './models/shipment.model';

/** Reads the "Order Number Format" prefix from Business Configuration (`orderPrefix`), falling back to the default 'ORD' when unset. */
async function getOrderNumberPrefix(): Promise<string> {
  const config = await getConfiguration('business');
  const prefix = (config as { orderPrefix?: unknown }).orderPrefix;
  return typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'ORD';
}

/**
 * Every order status transition should notify the customer and leave an audit
 * trail (spec: "Each status should: Update timeline, Create activity log, Send
 * notification"). statusHistory already covers the timeline; this covers the
 * other two, fire-and-forget so a notification/audit hiccup never blocks the
 * transition itself from committing.
 */
async function notifyOrderStatusChange(
  order: Pick<OrderDocument, 'customerId' | 'orderNumber'> & { _id: mongoose.Types.ObjectId },
  status: OrderStatus,
  actorId: string | null,
) {
  try {
    const customer = await UserModel.findById(order.customerId).select('email name').lean();
    if (customer?.email) {
      await enqueueNotification({
        channel: 'email',
        templateKey: 'order_status_changed',
        recipient: customer.email,
        userId: String(order.customerId),
        orderId: String(order._id),
        category: NOTIFICATION_CATEGORIES.ORDER,
        data: { orderNumber: order.orderNumber, status, name: customer.name },
      });
    }
  } catch {
    // Notification failures must never roll back a status transition.
  }

  await recordAudit({
    actorId,
    actorType: actorId ? undefined : ACTOR_TYPES.SYSTEM,
    action: 'update',
    resource: 'order',
    resourceId: String(order._id),
    after: { status },
  });
}

/** Restocks every SALE StockMovement recorded against an order (used by both cancellation and payment-failure compensation). */
async function restockOrderSales(
  order: mongoose.Document & OrderDocument & { _id: mongoose.Types.ObjectId },
  actorId: string,
  reason: string,
  referenceType: string,
  session: ClientSession,
) {
  const saleMovements = await StockMovementModel.find({
    referenceType: 'order',
    referenceId: order._id,
    type: STOCK_MOVEMENT_TYPES.SALE,
  }).session(session);

  for (const movement of saleMovements) {
    const batch = await BatchModel.findById(movement.batchId).session(session);
    if (!batch) continue;
    batch.quantityAvailable += Math.abs(movement.quantity);
    await batch.save({ session });

    await StockMovementModel.create(
      [
        {
          batchId: batch._id,
          warehouseId: batch.warehouseId,
          type: STOCK_MOVEMENT_TYPES.RETURN,
          quantity: Math.abs(movement.quantity),
          balanceAfter: batch.quantityAvailable,
          referenceType,
          referenceId: order._id,
          performedBy: actorId,
          notes: reason,
        },
      ],
      { session },
    );
  }
}

/**
 * Resolves which Seller (if any) this checkout should be attributed to and
 * fulfilled from — Part 7/8: an order belongs to exactly one Seller, and its
 * stock must only be drawn from that Seller's own warehouses (never a
 * different Seller's). Deliberately conservative, NOT a marketplace
 * seller-selection UI:
 *
 *  - Zero enabled Sellers exist yet -> `null` (pre-migration / no Seller
 *    entity set up at all). Checkout behaves exactly as it did before —
 *    fully backward compatible, unrestricted batch selection.
 *  - Exactly one enabled Seller exists -> that Seller. The common case for
 *    this client (docs/DEVELOPMENT_TASKS.md: "2-3 sellers", one operating at
 *    a time today).
 *  - Multiple enabled Sellers exist -> the Business Configuration
 *    `defaultSellerId` (if set and still enabled), else `null` (ambiguous —
 *    we do NOT guess; Part 18 explicitly forbids silently assigning a seller).
 *    An ambiguous-but-unattributed order is exactly the "flag for manual
 *    mapping" case, surfaced via `sellerId: null` rather than a fabricated guess.
 */
/**
 * Exported ( 19 Part 14) so coupon validation (cart.service.ts's
 * applyCouponToCart / coupon.service.ts's previewCouponForCart) can resolve
 * the SAME seller checkout() itself would use, rather than a second,
 * possibly-inconsistent resolution — required for seller-scoped coupon
 * eligibility to be checked correctly BEFORE checkout, not just at it.
 */
export async function resolveCheckoutSeller(): Promise<{
  sellerId: mongoose.Types.ObjectId | null;
  warehouseIds: mongoose.Types.ObjectId[] | null;
}> {
  const enabledSellers = await SellerModel.find({ enabled: true, deletedAt: null })
    .select('_id')
    .lean();

  let sellerId: mongoose.Types.ObjectId | null = null;
  if (enabledSellers.length === 1) {
    sellerId = enabledSellers[0]._id as mongoose.Types.ObjectId;
  } else if (enabledSellers.length > 1) {
    const config = await getConfiguration('business');
    const configuredId = (config as { defaultSellerId?: unknown }).defaultSellerId;
    if (typeof configuredId === 'string' && mongoose.isValidObjectId(configuredId)) {
      const stillEnabled = enabledSellers.some((s) => String(s._id) === configuredId);
      if (stillEnabled) sellerId = new mongoose.Types.ObjectId(configuredId);
    }
  }

  if (!sellerId) return { sellerId: null, warehouseIds: null };

  const warehouses = await WarehouseModel.find({ sellerId, deletedAt: null }).select('_id').lean();
  return { sellerId, warehouseIds: warehouses.map((w) => w._id as mongoose.Types.ObjectId) };
}

/**
 * FIFO stock consumption: draws from the batch with the earliest expiry first,
 * so older stock sells before newer stock — the standard pharma inventory rule.
 * Runs inside the checkout transaction; throwing here rolls the whole order back.
 *
 * `warehouseIds`, when non-null, restricts the pool of eligible batches to
 * those specific warehouses — this is how cross-seller inventory deduction is
 * prevented (Part 8) once a checkout has been attributed to a Seller. `null`
 * means "no restriction" (legacy behavior, used when no Seller could be
 * resolved — see `resolveCheckoutSeller`).
 */
/**
 * Exported ( 16 Part 27) so replacement-order stock reservation
 * (return.service.ts's resolveReturnReplacement) reuses the exact same
 * FEFO/recall-safe selection logic checkout() uses — never a second,
 * possibly-inconsistent stock-picking implementation.
 */
export async function decrementStockFifo(
  productId: string,
  variantId: string | null,
  quantity: number,
  orderId: mongoose.Types.ObjectId,
  actorId: string,
  session: ClientSession,
  warehouseIds: mongoose.Types.ObjectId[] | null,
  sku?: string,
) {
  const batches = await BatchModel.find({
    productId,
    variantId: variantId ?? null,
    quantityAvailable: { $gt: 0 },
    deletedAt: null,
    // Part 5/FEFO connection — a recalled batch may still exist
    // physically (never deleted, never zeroed out) but must never be picked
    // for a NEW sale/reservation. `$ne: true` also matches batches predating
    // this field (recallFlag undefined) so it's a no-op for existing data.
    recallFlag: { $ne: true },
    ...(warehouseIds ? { warehouseId: { $in: warehouseIds } } : {}),
  })
    .sort({ expiryDate: 1 })
    .session(session);

  const totalAvailable = batches.reduce((sum, b) => sum + b.quantityAvailable, 0);
  if (totalAvailable < quantity) {
    throw new UnprocessableEntityError(`Insufficient stock for product ${productId}`);
  }

  let remaining = quantity;
  const consumedBatchIds: mongoose.Types.ObjectId[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityAvailable, remaining);
    const previousStock = batch.quantityAvailable;

    batch.quantityAvailable -= take;
    await batch.save({ session });

    await StockMovementModel.create(
      [
        {
          batchId: batch._id,
          warehouseId: batch.warehouseId,
          type: STOCK_MOVEMENT_TYPES.SALE,
          quantity: -take,
          balanceAfter: batch.quantityAvailable,
          referenceType: 'order',
          referenceId: orderId,
          performedBy: actorId,
        },
      ],
      { session },
    );

    // Bugfix (Human-Readable API Logging) Part 12/13 — lets a developer
    // reconstruct exactly which batches an order drew stock from (and how
    // much each had before/after) from the logs alone, without reading a
    // StockMovement row by hand. `sku` comes from the checkout draft's
    // already-resolved product/component SKU (Part 10: no extra query on
    // this transactional hot path just to log).
    logger.info(
      {
        orderId: String(orderId),
        batchId: String(batch._id),
        sku: sku ?? null,
        quantity: take,
        previousStock,
        newStock: batch.quantityAvailable,
      },
      'Inventory allocated',
    );

    if (consumedBatchIds.length === 0) consumedBatchIds.push(batch._id);
    remaining -= take;
  }

  return consumedBatchIds[0] ?? null;
}

export interface CheckoutInput {
  addressId: string;
  couponCode?: string;
  deliveryType?: 'standard' | 'express';
}

/**
 * (prepaid-only redesign) — the frozen, fully-validated checkout
 * plan: everything `checkout()` used to compute (cart/address/combo/coupon/
 * GST/shipping/prescription-gate validation, per-line pricing, the FEFO
 * stock plan) BEFORE it used to create an Order. Now this is a pure,
 * serializable snapshot — no DB writes happen while building it — persisted
 * onto `Payment.checkoutSnapshot` at checkout-INTENT time (before payment),
 * and consumed VERBATIM by `finalizeOrderFromDraft` once payment is
 * verified. Every id is a plain string (never a Mongoose ObjectId/Map) so
 * this survives a round trip through `Schema.Types.Mixed` unchanged.
 */
export interface CheckoutDraft {
  userId: string;
  addressId: string;
  deliveryType?: 'standard' | 'express';
  items: Record<string, unknown>[];
  stockPlan: { productId: string; variantId: string | null; quantity: number; sku: string }[][];
  shippingAddress: {
    name: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  sellerId: string | null;
  warehouseIds: string[] | null;
  totals: { subtotal: number; gst: number; shipping: number; discount: number; grandTotal: number };
  couponCode: string | null;
  couponId: string | null;
  couponSnapshot: {
    couponId: string;
    code: string;
    type: string;
    value: number;
    maxDiscountAmount: number | null;
    discountAmount: number;
  } | null;
  couponAllocation: { productId: string; amount: number }[];
  prescriptionRequired: boolean;
}

/**
 * Phase 1 of checkout — validates everything and computes the authoritative
 * checkout amount, but creates NOTHING and deducts NO inventory (Part 6:
 * "atomic final inventory check + deduction after payment verification" —
 * the option chosen here because no reservation-hold mechanism exists
 * anywhere in this codebase to extend, and inventing one would duplicate
 * what `decrementStockFifo` already does atomically at finalize time). This
 * is the exact validation/pricing logic the OLD `checkout()` ran before its
 * transaction — unchanged, just no longer followed by an immediate Order
 * write. Called by `payment.service.ts::createCheckoutIntent`.
 */
export async function buildCheckoutDraft(userId: string, input: CheckoutInput): Promise<CheckoutDraft> {
  const cart = await CartModel.findOne({ userId });
  if (!cart || cart.items.length === 0) throw new UnprocessableEntityError('Cart is empty');

  const address = await CustomerAddressModel.findOne({ _id: input.addressId, userId });
  if (!address) throw new NotFoundError('Address');

  // Bugfix (Order/Shiprocket/Invoice) — `CustomerAddress` has no recipient-
  // name field, only `label` (a free-text nickname like "Home"/"Office",
  // default 'Home'). The snapshot below previously stored `address.label`
  // as `shippingAddress.name`, which then flowed unchanged into both the
  // Shiprocket `billing_customer_name` and the printed invoice's billed-to
  // name — i.e. shipping labels/invoices showed "Home" instead of the
  // customer's actual name. The account holder's name is the correct,
  // already-available source (no "ship to someone else" feature exists
  // anywhere in this codebase to justify a new address-level field).
  const customer = await UserModel.findById(userId).select('name').lean();
  if (!customer) throw new NotFoundError('Customer');

  const products = await ProductModel.find({
    _id: { $in: cart.items.map((i) => i.productId) },
    isActive: true,
  }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  // Bundle expansion ( 12 Part 7) — resolved up front, outside the
  // transaction (read-only), for every cart line whose product is a bundle SKU.
  const bundleByProductId = new Map<string, Awaited<ReturnType<typeof getBundleForCheckout>>>();
  for (const item of cart.items) {
    const product = productMap.get(String(item.productId));
    if (product?.isBundle) {
      const bundle = await getBundleForCheckout(String(item.productId));
      if (!bundle) {
        throw new UnprocessableEntityError(
          `"${product.name}" is not currently available as a bundle`,
        );
      }
      bundleByProductId.set(String(item.productId), bundle);
    }
  }

  // Component products (across every bundle line) and every category
  // referenced by a plain product OR a bundle's components, fetched in bulk
  // so the per-item resolution below (resolveProductDefaults) never issues a
  // query inside the loop.
  const componentProductIds = [...bundleByProductId.values()].flatMap((b) =>
    b!.items.map((i) => i.componentProductId),
  );
  const componentProducts = componentProductIds.length
    ? await ProductModel.find({ _id: { $in: componentProductIds } })
        .select('name sku mrp gstRate medicine.prescriptionRequired categoryId expirable weightGrams')
        .lean()
    : [];
  const componentProductMap = new Map(componentProducts.map((p) => [String(p._id), p]));

  const categoryIds = [
    ...new Set([
      ...products.map((p) => String(p.categoryId)),
      ...componentProducts.map((p) => String(p.categoryId)),
    ]),
  ];
  const categories = await CategoryModel.find({ _id: { $in: categoryIds } })
    .select('isExpirableDefault requiresPrescriptionDefault')
    .lean();
  const categoryMap = new Map(categories.map((c) => [String(c._id), c]));

  let prescriptionRequired = false;
  let subtotal = 0;
  let gstTotal = 0;
  // sum of every line's `product.shippingCharge * quantity`
  // (round2'd) — a SEPARATE, ADDITIVE component from the pre-existing
  // zone/weight-based `calculateShippingCharge` below, not a replacement
  // for it (Part 7/47: the zone engine models "courier cost by
  // destination," this new one models "this specific product's admin-
  // configured handling/shipping surcharge" — both are legitimate,
  // independently-configured business charges, summed into one
  // `totals.shipping`).
  let productShippingTotal = 0;
  // Part 3/6 — parcel weight for weight-based shipping rules
  // (ShippingRule.minWeightGrams/maxWeightGrams already existed and were
  // simply never fed a real value; calculateShippingCharge below silently
  // ignored weight-tiered rules for every checkout until now).
  let totalWeightGrams = 0;
  // Parallel to draftItems (1:1 by index) — what to actually reserve from
  // inventory for each order line. A bundle line expands into one entry per
  // component instead of one entry for the (non-stocked) bundle product
  // itself — "must not create fake physical stock for the bundle" (Part 7).
  const stockPlan: { productId: string; variantId: string | null; quantity: number; sku: string }[][] = [];
  // Part 12/13/30 — 1:1 with draftItems by index; the coupon
  // eligibility/discount-allocation context, built from the SAME per-line
  // GST-exclusive subtotal already being accumulated below (never a second,
  // independently-computed subtotal).
  const couponLines: CartLine[] = [];

  const draftItems = cart.items.map((item) => {
    const product = productMap.get(String(item.productId));
    if (!product) {
      throw new UnprocessableEntityError(
        'One or more products in your cart are no longer available',
      );
    }

    const bundle = bundleByProductId.get(String(item.productId));

    if (bundle) {
      // Bundle line — charged at Bundle.sellingPrice, NEVER the sum of
      // component list prices (Part 7's explicit rule: a ₹600-component
      // bundle sold at ₹499 stays ₹499, the system must not "correct" it).
      const unitPrice = bundle.sellingPrice;
      let weightedGstRate = 0;
      const bundleComponents = bundle.items.map((bi) => {
        const comp = componentProductMap.get(bi.componentProductId);
        if (!comp) {
          throw new UnprocessableEntityError(
            'One or more bundle component products are no longer available',
          );
        }
        const compCategory = categoryMap.get(String(comp.categoryId));
        if (resolveProductDefaults(comp, compCategory).requiresPrescription) {
          prescriptionRequired = true;
        }
        const gstRate = comp.gstRate ?? 0;
        weightedGstRate += gstRate * bi.priceRatio;
        if (typeof comp.weightGrams === 'number') {
          totalWeightGrams += comp.weightGrams * bi.quantity * item.quantity;
        }
        return {
          productId: bi.componentProductId,
          name: comp.name,
          sku: comp.sku,
          quantity: bi.quantity * item.quantity,
          // This component's per-unit share of the ACTUAL charged
          // unitPrice, apportioned by priceRatio — for future GST/invoice
          // apportionment only (Part 7's "priceRatio is NOT used to
          // calculate the bundle selling price").
          unitPriceShare: Math.round(unitPrice * bi.priceRatio * 100) / 100,
          gstRate,
        };
      });

      stockPlan.push(
        bundle.items.map((bi) => {
          const comp = componentProductMap.get(bi.componentProductId);
          return {
            productId: bi.componentProductId,
            variantId: null,
            quantity: bi.quantity * item.quantity,
            sku: comp?.sku ?? '',
          };
        }),
      );

      const lineSubtotal = unitPrice * item.quantity;
      const lineGst = (lineSubtotal * weightedGstRate) / 100;
      subtotal += lineSubtotal;
      gstTotal += lineGst;
      // Part 10 — the COMBO product's own configured
      // `shippingCharge`, never summed/derived from components — mirrors
      // exactly how the combo's own `sellingPrice` (not a component sum) is
      // already the commercial basis (Part 7 above). Shipping is a
      // commercial attribute of the sellable SKU, not a tax-legal one (unlike
      // GST, which stays correctly component-weighted for HSN reporting).
      const lineShipping = Math.round((product.shippingCharge ?? 0) * item.quantity * 100) / 100;
      productShippingTotal = Math.round((productShippingTotal + lineShipping) * 100) / 100;
      couponLines.push({
        productId: String(item.productId),
        categoryId: String(product.categoryId),
        lineSubtotal,
      });

      return {
        // explicitly stringified (never a raw Mongoose ObjectId):
        // this object is persisted onto `Payment.checkoutSnapshot` (a plain
        // Mixed/JSON field) at checkout-intent time and read back verbatim
        // at order-finalization time, potentially much later and via a
        // completely separate request — every id must be a guaranteed-plain,
        // guaranteed-serializable value.
        productId: String(item.productId),
        variantId: item.variantId ? String(item.variantId) : null,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        gstRate: Math.round(weightedGstRate * 100) / 100,
        amount: Math.round((lineSubtotal + lineGst) * 100) / 100,
        shippingAmount: lineShipping,
        bundleComponents,
      };
    }

    const category = categoryMap.get(String(product.categoryId));
    if (resolveProductDefaults(product, category).requiresPrescription) {
      prescriptionRequired = true;
    }

    const unitPrice = product.basePrice;
    const gstRate = product.gstRate ?? 0;
    const lineSubtotal = unitPrice * item.quantity;
    const lineGst = (lineSubtotal * gstRate) / 100;
    subtotal += lineSubtotal;
    gstTotal += lineGst;
    // this plain product's own configured `shippingCharge`,
    // per unit (Part 8's worked example: shippingCharge=₹20, qty=3 -> ₹60).
    const lineShipping = Math.round((product.shippingCharge ?? 0) * item.quantity * 100) / 100;
    productShippingTotal = Math.round((productShippingTotal + lineShipping) * 100) / 100;
    if (typeof product.weightGrams === 'number') {
      totalWeightGrams += product.weightGrams * item.quantity;
    }

    stockPlan.push([
      {
        productId: String(item.productId),
        variantId: item.variantId ? String(item.variantId) : null,
        quantity: item.quantity,
        sku: product.sku,
      },
    ]);
    couponLines.push({
      productId: String(item.productId),
      categoryId: String(product.categoryId),
      lineSubtotal,
    });

    return {
      // see the bundle-line branch above for why these are
      // explicitly stringified.
      productId: String(item.productId),
      variantId: item.variantId ? String(item.variantId) : null,
      name: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice,
      gstRate,
      amount: Math.round((lineSubtotal + lineGst) * 100) / 100,
      shippingAmount: lineShipping,
    };
  });

  // (inventory lifecycle) Part 22/23 — "revalidate inventory using
  // the canonical inventory service before payment, reject if requested
  // exceeds available." This is a NEW check: previously nothing validated
  // stock until `decrementStockFifo` ran inside `finalizeOrderFromDraft`,
  // AFTER the customer had already paid — a predictable "out of stock"
  // (not a genuine last-instant race) would still charge the card and only
  // surface as a Part 24 reconciliation case. This check runs here, at
  // checkout-INTENT time (before Razorpay is even involved), using the
  // exact same canonical `resolveProductAvailability` every storefront
  // surface already reads (Part 3 — never a second, competing stock
  // formula) against `stockPlan`'s already-expanded, already-correct
  // component-level requirements (a bundle line was expanded into its
  // components above, so this naturally enforces Part 6/7's required-
  // quantity math with zero extra logic).
  //
  // This is advisory, not the enforcement mechanism — it narrows the
  // window in which a payment can be taken for stock that turns out to be
  // gone, but cannot close it entirely (stock can still change in the
  // seconds between this check and the customer completing payment). The
  // ATOMIC, database-level guarantee against overselling still lives
  // exclusively in `decrementStockFifo` inside the finalize transaction
  // below — this check is never a substitute for that one.
  const requiredQtyByProductId = new Map<string, number>();
  for (const planLines of stockPlan) {
    for (const line of planLines) {
      requiredQtyByProductId.set(
        line.productId,
        (requiredQtyByProductId.get(line.productId) ?? 0) + line.quantity,
      );
    }
  }
  if (requiredQtyByProductId.size > 0) {
    const availabilityMap = await resolveProductAvailability([...requiredQtyByProductId.keys()]);
    for (const [productId, requiredQty] of requiredQtyByProductId) {
      const availableQty = availabilityMap.get(productId) ?? 0;
      if (availableQty < requiredQty) {
        const productName =
          productMap.get(productId)?.name ?? componentProductMap.get(productId)?.name ?? 'One or more items';
        throw new UnprocessableEntityError(
          `"${productName}" only has ${availableQty} unit(s) available — please update the quantity in your cart`,
        );
      }
    }
  }

  // Part 14 — resolved BEFORE coupon validation (moved up from
  // its previous position right before order-number generation) so a
  // seller-scoped coupon's eligibility can be checked against the actual
  // checkout seller, not validated blind.
  const { sellerId, warehouseIds } = await resolveCheckoutSeller();

  const couponCode = input.couponCode ?? cart.couponCode ?? undefined;
  let discount = 0;
  let appliedCouponId: string | null = null;
  let couponAllocationByProductId = new Map<string, number>();
  let appliedCoupon: Awaited<ReturnType<typeof validateCouponForCart>>['coupon'] | null = null;

  if (couponCode) {
    // Part 22 — this is the AUTHORITATIVE, checkout-time
    // revalidation. Whatever `applyCouponToCart` validated earlier when the
    // coupon was first added to the cart is NOT trusted here — usage limits,
    // dates, and eligibility can all have changed since then.
    const validation = await validateCouponForCart(couponCode, {
      userId,
      cartTotal: subtotal,
      sellerId: sellerId ? String(sellerId) : null,
      lines: couponLines,
    });
    discount = validation.discountAmount;
    appliedCouponId = String(validation.coupon._id);
    appliedCoupon = validation.coupon;
    couponAllocationByProductId = new Map(validation.allocation.map((a) => [a.productId, a.amount]));
    // Part 30/34/35 — freeze each line's exact discount share onto
    // the order item itself now, at the only point the eligible-vs-ineligible
    // split is known, so refund/return math never has to re-derive it later.
    for (const draftItem of draftItems) {
      const share = couponAllocationByProductId.get(String(draftItem.productId));
      if (share != null) (draftItem as { couponDiscountAmount?: number }).couponDiscountAmount = share;
    }
  }

  // two INDEPENDENT, ADDITIVE shipping components: the
  // pre-existing zone/weight-based engine (destination + parcel weight —
  // unchanged, still authoritative for "what does it cost to actually
  // courier this order") plus the new per-product `shippingCharge` sum
  // computed per-line above (a product-level commercial surcharge). Neither
  // replaces the other; see the `productShippingTotal` declaration above
  // for the full rationale.
  const zoneShipping = await calculateShippingCharge({
    subtotal,
    state: address.state,
    pincode: address.pincode,
    deliveryType: input.deliveryType,
    totalWeightGrams: totalWeightGrams > 0 ? totalWeightGrams : undefined,
  });
  const shipping = Math.round((zoneShipping + productShippingTotal) * 100) / 100;
  const grandTotal = Math.round((subtotal + gstTotal + shipping - discount) * 100) / 100;

  // Part 7/8/16 — an ADDITIONAL, stricter checkout-time gate,
  // off by default (RX-01's documented gate is at fulfillment/packed, not
  // here) but a real, working toggle for a business that wants to require
  // at least one prescription on file BEFORE a checkout-intent can even be
  // created, never just a hidden UI affordance (Part 8: never trust the
  // frontend to enforce this).
  if (prescriptionRequired) {
    const prescriptionConfig = await getPrescriptionConfig();
    if (prescriptionConfig.managementEnabled && prescriptionConfig.checkoutUploadRequired) {
      const hasSubmittedPrescription = await PrescriptionUploadModel.exists({
        userId,
        status: { $in: [PRESCRIPTION_STATUS.PENDING, PRESCRIPTION_STATUS.APPROVED] },
      });
      if (!hasSubmittedPrescription) {
        throw new UnprocessableEntityError(
          'This order contains prescription-required items — please upload a valid prescription before checkout',
        );
      }
    }
  }

  // deliberately does NOT touch the cart, create an Order, or
  // deduct any inventory here. Everything below this point is pure,
  // serializable data — every id a plain string, never a Mongoose ObjectId —
  // so it survives being stored on `Payment.checkoutSnapshot` (Mixed) and
  // read back unchanged by `finalizeOrderFromDraft`.
  return {
    userId,
    addressId: input.addressId,
    deliveryType: input.deliveryType,
    items: draftItems,
    stockPlan,
    shippingAddress: {
      name: customer.name,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      phone: address.phone,
    },
    sellerId: sellerId ? String(sellerId) : null,
    warehouseIds: warehouseIds ? warehouseIds.map((id) => String(id)) : null,
    totals: { subtotal, gst: gstTotal, shipping, discount, grandTotal },
    couponCode: appliedCouponId ? couponCode!.toUpperCase() : null,
    couponId: appliedCouponId,
    couponSnapshot: appliedCoupon
      ? {
          couponId: String(appliedCoupon._id),
          code: couponCode!.toUpperCase(),
          type: appliedCoupon.type,
          value: appliedCoupon.value,
          maxDiscountAmount: appliedCoupon.maxDiscountAmount ?? null,
          discountAmount: discount,
        }
      : null,
    couponAllocation: [...couponAllocationByProductId.entries()].map(([productId, amount]) => ({
      productId,
      amount,
    })),
    prescriptionRequired,
  };
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** Internal marker thrown from inside the transaction to distinguish "lost the race, a concurrent finalization already won" from a genuine failure — never leaks past this module. */
class OrderAlreadyFinalizedRace extends Error {}

export interface FinalizeOrderResult {
  order: OrderDocument & { _id: mongoose.Types.ObjectId };
  /** `true` when a CONCURRENT finalization attempt for the same payment already created the order — this call did no new writes, it just found and returned the winner (Part 8/9 idempotency). */
  alreadyExisted: boolean;
}

/**
 * Phase 2 of checkout — ONLY ever called after a payment has been verified
 * as captured (payment.service.ts's `finalizePaymentIntoOrder`, itself
 * called from both the frontend-verify endpoint and the Razorpay webhook —
 * either may win the race to call this first). This is where the Order
 * actually gets created, inventory actually gets deducted (Part 6/7: atomic,
 * inside one transaction — a race that loses the last unit of stock throws
 * and the WHOLE transaction rolls back, never a partial order), the coupon
 * usage is atomically committed, and the cart is finally cleared (Part 13:
 * "clear cart only after backend confirms successful order creation").
 *
 * Idempotency (Part 8/9): a fast pre-check first (`Order.findOne({paymentId})`
 * covers the overwhelmingly common case — frontend-verify already finalized,
 * the webhook arrives later purely as reconciliation). For a genuine
 * concurrent race, the DATABASE-level partial-unique index on
 * `Order.paymentId` (order.model.ts) is the real guarantee: the loser's
 * `OrderModel.create()` throws a duplicate-key error, which is caught here
 * and resolved by re-fetching and returning the winner's order — the exact
 * same pattern already used for Shiprocket's `shiprocketOrderId` idempotency
 * (shipment.model.ts / shiprocket-fulfillment.service.ts), reused rather
 * than reinvented.
 */
export async function finalizeOrderFromDraft(
  draft: CheckoutDraft,
  paymentId: string,
): Promise<FinalizeOrderResult> {
  const existing = await OrderModel.findOne({ paymentId });
  if (existing) return { order: existing, alreadyExisted: true };

  const orderNumber = await generateSequenceNumber('order', await getOrderNumberPrefix());
  const session = await mongoose.startSession();

  let createdOrder: (OrderDocument & { _id: mongoose.Types.ObjectId }) | null = null;
  let raceLost = false;
  let recordedCouponId: string | null = null;
  try {
    createdOrder = await session.withTransaction(async () => {
      let order: mongoose.Document & OrderDocument & { _id: mongoose.Types.ObjectId };
      try {
        [order] = await OrderModel.create(
          [
            {
              orderNumber,
              customerId: draft.userId,
              sellerId: draft.sellerId,
              items: draft.items,
              shippingAddress: draft.shippingAddress,
              // an Order now only ever comes into existence AFTER
              // payment is verified captured, so its FIRST status is still
              // the existing "placed" (no new/renamed order status — Part
              // 20: preserve the existing state machine unchanged), but
              // `paymentStatus` is ALWAYS `captured` at creation, never
              // `pending` — that invariant is itself what "prepaid-only"
              // means at the data-model level going forward.
              status: ORDER_STATUS.PLACED,
              statusHistory: [
                { status: ORDER_STATUS.PLACED, changedBy: draft.userId, note: 'Order placed (payment confirmed)' },
              ],
              totals: draft.totals,
              couponCode: draft.couponCode,
              // Part 31 / Part 14 — the snapshot frozen at
              // checkout-INTENT time, reused verbatim — never recomputed
              // from the coupon's current state at finalize time. A coupon
              // later disabled/edited/archived, or a combo/product whose
              // price changes tomorrow, can never alter what this order
              // says the customer paid today.
              couponSnapshot: draft.couponSnapshot,
              prescriptionRequired: draft.prescriptionRequired,
              paymentId,
              paymentStatus: PAYMENT_STATUS.CAPTURED,
            },
          ],
          { session },
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) throw new OrderAlreadyFinalizedRace();
        throw err;
      }

      // stockPlan[i] corresponds 1:1 with order.items[i] — one entry per
      // component for a bundle line, exactly one entry for a plain line.
      // Every reservation goes through the exact same existing FEFO function
      // regardless of whether it originated from a bundle or a direct
      // purchase (Part 7: "Do not create a separate FIFO/FEFO algorithm for
      // bundles"). Insufficient stock throws here and aborts the WHOLE
      // transaction — including the Order create above — so a lost stock
      // race NEVER leaves a partial/oversold order (Part 6/7).
      const warehouseIds = draft.warehouseIds
        ? draft.warehouseIds.map((id) => new mongoose.Types.ObjectId(id))
        : null;
      for (let i = 0; i < draft.stockPlan.length; i++) {
        const isBundleLine = 'bundleComponents' in draft.items[i];
        for (const planLine of draft.stockPlan[i]) {
          const batchId = await decrementStockFifo(
            planLine.productId,
            planLine.variantId,
            planLine.quantity,
            order._id,
            draft.userId,
            session,
            warehouseIds,
            planLine.sku,
          );
          if (!isBundleLine && batchId) {
            order.items[i].batchId = batchId;
          }
        }
      }
      await order.save({ session });

      // link the Payment BACK to the order it produced, inside
      // the same transaction as the order creation itself. Several existing,
      // unrelated modules (admin/payments.service.ts's refund flow chief
      // among them) already read `Payment.orderId` directly and predate this
      // redesign — this keeps that contract intact rather than requiring
      // every existing consumer to be rewritten to do a reverse
      // `Order.findOne({paymentId})` lookup instead. Safe to do as a plain
      // (non-guarded) update here specifically because reaching this line at
      // all already means THIS call won the `OrderModel.create()` race above
      // (a loser would have thrown `OrderAlreadyFinalizedRace` before ever
      // getting here) — there is nothing left to race against.
      await PaymentModel.updateOne({ _id: paymentId }, { orderId: order._id }, { session });

      if (draft.couponId) {
        // Re-fetched fresh (never trusted from the pre-payment snapshot) so
        // the atomic usage-limit guard inside recordCouponUsage checks the
        // coupon's CURRENT state — a coupon that got fully exhausted by
        // someone else while this customer was on the Razorpay screen must
        // still correctly abort finalization (Part 24 reconciliation path),
        // never silently drop the discount and re-charge, and never silently
        // over-redeem past its limit.
        const coupon = await CouponModel.findById(draft.couponId).session(session);
        if (!coupon) {
          throw new UnprocessableEntityError(
            'The applied coupon is no longer available — this payment could not be finalized into an order',
          );
        }
        await recordCouponUsage(
          coupon,
          draft.userId,
          String(order._id),
          draft.totals.discount,
          draft.couponAllocation,
          session,
        );
        recordedCouponId = String(coupon._id);
      }

      // Part 13 — the cart is cleared ONLY here, inside the same transaction
      // as the confirmed order it corresponds to. A failed/cancelled payment
      // (this function is simply never called) leaves the cart untouched.
      await CartModel.updateOne(
        { userId: draft.userId },
        { $set: { items: [], couponCode: null } },
        { session },
      );

      return order;
    });
  } catch (err) {
    if (err instanceof OrderAlreadyFinalizedRace) {
      raceLost = true;
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  if (raceLost) {
    const winner = await OrderModel.findOne({ paymentId });
    if (winner) return { order: winner, alreadyExisted: true };
    // Genuinely shouldn't happen (a duplicate-key error on paymentId implies
    // a document with that paymentId exists) — surfaced as a real error
    // rather than silently swallowed.
    throw new UnprocessableEntityError('Order finalization race could not be resolved');
  }

  const order = createdOrder!;

  // Part 16/19/28 — fired ONLY on the winning path that actually
  // just deducted stock (never for the `alreadyExisted`/raceLost early
  // returns above — those performed no new deduction, so there is nothing
  // new to announce). Strictly AFTER the transaction committed (Part 19:
  // never publish a value that could still be rolled back), and its own
  // internal try/catch means a Redis outage here can never roll back or
  // fail the order that was already durably committed to MongoDB (Part 28).
  const changedProductIds = [...new Set(draft.stockPlan.flat().map((line) => line.productId))];
  await publishInventoryUpdate(changedProductIds);

  // Outside the transaction — notification/audit writes aren't part of the
  // order's atomicity guarantee, and shouldn't roll back a committed order.
  await notifyOrderStatusChange(order, ORDER_STATUS.PLACED, draft.userId);
  const orderCustomer = await UserModel.findById(order.customerId).select('name').lean();
  await notifyAdmins({
    templateKey: 'admin_new_order',
    orderId: String(order._id),
    data: {
      orderNumber: order.orderNumber,
      orderTotal: (order.totals?.grandTotal ?? 0).toFixed(2),
      customerName: orderCustomer?.name ?? 'A customer',
    },
  });
  if (recordedCouponId) {
    await recordAudit({
      actorId: draft.userId,
      actorType: ACTOR_TYPES.CUSTOMER,
      action: COUPON_AUDIT_ACTIONS.COUPON_USAGE_COMMITTED,
      resource: 'coupon',
      resourceId: recordedCouponId,
      metadata: { orderId: String(order._id), discountAmount: draft.totals.discount },
    });
  }
  return { order, alreadyExisted: false };
}

export async function getOrderById(id: string, requester: { id: string; role: string }) {
  const order = await OrderModel.findById(id).lean();
  if (!order) throw new NotFoundError('Order');
  if (requester.role === 'customer' && String(order.customerId) !== requester.id) {
    throw new ForbiddenError('You do not have access to this order');
  }
  return order;
}

/**
 * Part 10/11/13/46 — the customer order-DETAIL view composed from
 * the SAME authoritative services/models every other part of this codebase
 * already reads from (never a second calculation): the order's own frozen
 * `totals`/`couponSnapshot`/`items[].couponDiscountAmount` (Part 11/13 —
 * historical pricing is never recomputed), plus one cheap summary read each
 * from Invoice/Return/Refund/Shipment/replacement-Order. Reuses
 * `getOrderById` for the ownership check (never duplicated) — this is
 * purely an ENRICHMENT of that same authoritative fetch for the customer's
 * own detail page, replacing what the web client previously assembled
 * itself via three separate round-trips.
 */
export async function getOrderDetailForCustomer(id: string, requester: { id: string; role: string }) {
  const order = await getOrderById(id, requester);
  const orderId = order._id;

  const [invoice, returns, refunds, replacementOrder, shipments] = await Promise.all([
    InvoiceModel.findOne({ orderId }).select('invoiceNumber status storageProvider pdfUrl createdAt').lean(),
    ReturnModel.find({ orderId })
      .select('returnNumber status resolutionType items rejectionReason reverseShipment createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    RefundModel.find({ orderId }).select('amount status createdAt').sort({ createdAt: -1 }).lean(),
    OrderModel.findOne({ originalOrderId: orderId }).select('orderNumber status createdAt').lean(),
    ShipmentModel.find({ orderId })
      .select('status awbCode courierName trackingEvents estimatedDeliveryDate createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    ...order,
    invoice: invoice
      ? { invoiceNumber: invoice.invoiceNumber, status: invoice.status, available: Boolean(invoice.pdfUrl) }
      : null,
    returns,
    refunds,
    replacementOrder,
    shipments,
    // Part 21/22 — a coarse, PRESENTATION-ONLY signal ("can the return button
    // even show"), deliberately the SAME top-level gate requestReturn()
    // itself checks first. The full per-item/window/quantity eligibility
    // rules stay exactly where they already authoritatively live
    // (return.service.ts's requestReturn) — never duplicated here.
    returnEligible: order.status === ORDER_STATUS.DELIVERED,
  };
}

export function listMyOrders(userId: string, query: ListQuery) {
  return OrderModel.find({ customerId: userId })
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
}

export function listOrders(query: ListQuery) {
  const skip = (query.page - 1) * query.limit;
  return Promise.all([
    OrderModel.find(query.filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    OrderModel.countDocuments(query.filter),
  ]).then(([items, total]) => ({
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  }));
}

/**
 * `actorId` is nullable ( 14) so automated fulfillment transitions
 * (Shiprocket AWB assignment, webhook-driven SHIPPED/OUT_FOR_DELIVERY/
 * DELIVERED updates — see shiprocket-fulfillment.service.ts) can advance the
 * order lifecycle without a human in the loop, exactly like invoice
 * generation already does. `statusHistory.changedBy` stays `null` (its
 * existing schema default) rather than being attributed to a placeholder
 * user, and the audit row further down gets `actorType: SYSTEM`/`WEBHOOK`
 * instead (Part 27/30 — never attribute automated actions to the last admin).
 */
export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  actorId: string | null,
  note?: string,
) {
  const order = await OrderModel.findById(id);
  if (!order) throw new NotFoundError('Order');

  const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new UnprocessableEntityError(
      `Cannot transition order from "${order.status}" to "${newStatus}"`,
    );
  }

  // RX-01 — the documented, previously-missing enforcement:
  // `order.prescriptionVerified` existed but was never read
  // anywhere. A prescription-required order cannot progress to PACKED (the
  // same fulfillment gate point that attaches invoice generation to)
  // while unverified — configuration-driven (Part 15/43), not hardcoded, so
  // it can only ever be reached when BOTH prescription management and the
  // order-blocking rule are enabled; a business that hasn't turned this
  // feature on sees no change in behavior at all.
  if (newStatus === ORDER_STATUS.PACKED && order.prescriptionRequired && !order.prescriptionVerified) {
    const prescriptionConfig = await getPrescriptionConfig();
    if (prescriptionConfig.managementEnabled && prescriptionConfig.orderBlockingEnabled) {
      throw new UnprocessableEntityError(
        'This order requires a verified prescription before it can be packed for shipment',
      );
    }
  }

  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    changedBy: actorId ? new mongoose.Types.ObjectId(actorId) : null,
    note: note ?? '',
    changedAt: new Date(),
  });
  await order.save();

  await notifyOrderStatusChange(order, newStatus, actorId);

  // Part 10 — invoice generation is now aligned with the
  // documented pack-complete business flow (Order -> Payment confirmed ->
  // Inventory reservation -> Picking -> Packing complete -> Invoice
  // generation -> Shipment creation), not payment capture (see
  // payment.service.ts, which no longer triggers this directly). Queued
  // rather than generated inline since PDF rendering is too slow/heavy for
  // the request/response cycle (see invoice.worker.ts) — idempotent either
  // way (generateInvoiceForOrder never creates a second invoice for the same
  // order, see invoice.service.ts).
  if (newStatus === ORDER_STATUS.PACKED) {
    await enqueueInvoiceGeneration(String(order._id));
  }

  return order;
}

/** Cancellation restocks every consumed batch and logs a compensating `return`-type StockMovement. */
export async function cancelOrder(id: string, requester: { id: string; role: string }, reason: string) {
  const order = await OrderModel.findById(id);
  if (!order) throw new NotFoundError('Order');
  // Same ownership boundary as getOrderById — staff can cancel any order,
  // a customer only their own.
  if (requester.role === 'customer' && String(order.customerId) !== requester.id) {
    throw new ForbiddenError('You do not have access to this order');
  }

  const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(ORDER_STATUS.CANCELLED)) {
    throw new UnprocessableEntityError(`Cannot cancel an order in "${order.status}" status`);
  }

  const actorId = requester.id;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await restockOrderSales(order, actorId, reason, 'order_cancellation', session);

      order.status = ORDER_STATUS.CANCELLED;
      order.statusHistory.push({
        status: ORDER_STATUS.CANCELLED,
        changedBy: new mongoose.Types.ObjectId(actorId),
        note: reason,
        changedAt: new Date(),
      });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await notifyOrderStatusChange(order, ORDER_STATUS.CANCELLED, actorId);
  return order;
}

// (prepaid-only redesign) — the old `failOrder()` compensated an
// optimistic stock deduction that happened at checkout time, before payment.
// That no longer happens: an Order/stock deduction now only ever exists
// AFTER payment is verified captured (see `finalizeOrderFromDraft` above),
// so there is nothing left to compensate when a payment fails or is
// abandoned — a failed/cancelled payment simply never produces an Order at
// all (Payment.status stays `failed`/`pending`, no order, no stock touched;
// see payment.service.ts). `ORDER_STATUS.FAILED` remains a valid status in
// the state machine (for backward compatibility with historical orders
// created under the old flow) but nothing NEW transitions an order into it
// going forward.
