import { ORDER_STATUS, PAYMENT_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Items, status history, and address are embedded snapshots, not references —
 * an order is a point-in-time record of what was bought at what price/address;
 * it must not change if the Product or CustomerAddress it referenced later does.
 */
const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Prompt 11 — set once at checkout (see order.service.ts's checkout()) and
  // NEVER re-derived later from the fulfilling warehouse's current
  // sellerId — a warehouse's ownership can change (transferWarehouseSeller)
  // without rewriting the seller attribution of orders already placed
  // against it. `default: null` because pre-Prompt-11 orders (and orders
  // placed before any Seller exists / while seller resolution is ambiguous
  // across multiple sellers with no configured default) have no seller to
  // attribute — see docs/DEVELOPMENT_TASKS.md CAT-01 and this prompt's Part
  // 18 migration strategy. One seller per order (not a marketplace
  // multi-seller split) per Part 7.
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },

  items: {
    type: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
        batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
        name: { type: String, required: true },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        gstRate: { type: Number, required: true, min: 0 },
        amount: { type: Number, required: true, min: 0 },
        // Prompt 19 Part 30/34/35 — this line's exact share of the order's
        // coupon discount, computed once at checkout (see
        // coupon-discount-calculation.util.ts) and frozen here. Refund/return
        // math (return-refund-calculation.util.ts) reads THIS instead of
        // re-deriving a proportional share from order.totals.discount, so a
        // product/category-RESTRICTED coupon's discount is correctly
        // refunded only against the item(s) it actually applied to.
        // `default: 0` — every pre-Prompt-19 order line has no allocation.
        couponDiscountAmount: { type: Number, default: 0, min: 0 },
        // Prompt 30 — this line's frozen product-level shipping contribution
        // (product.shippingCharge * quantity at checkout time — see
        // order.service.ts's buildCheckoutDraft), summed into
        // `totals.shipping` alongside the pre-existing zone/weight-based
        // ShippingRule charge. `default: 0` — every pre-Prompt-30 order line
        // (and any product with no configured shippingCharge) contributes
        // nothing extra, so historical orders are unaffected.
        shippingAmount: { type: Number, default: 0, min: 0 },
        // Prompt 12 (Bundle/combo-pack) — present ONLY when this line is a
        // bundle purchase (product.isBundle was true at checkout);
        // `undefined`/omitted entirely for every plain-product line, so
        // existing non-bundle orders and this snapshot shape are unaffected.
        // A point-in-time snapshot like the rest of the item — historical
        // orders must never be recalculated from the bundle's *current*
        // configuration if it's edited/deleted later.
        bundleComponents: {
          type: [
            {
              productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
              name: { type: String, required: true },
              sku: { type: String, required: true },
              // Total component quantity for this order line, i.e. bundle
              // quantity purchased x this component's per-bundle quantity —
              // matches the "3 bundles x Product A x2 = 6" example.
              quantity: { type: Number, required: true, min: 1 },
              // This component's per-unit share of the bundle's actual
              // charged unitPrice (unitPrice * priceRatio at the time of
              // purchase) — for the future GST/invoice engine's tax
              // apportionment, never used to alter what the customer paid.
              unitPriceShare: { type: Number, required: true, min: 0 },
              gstRate: { type: Number, required: true, min: 0 },
            },
          ],
          default: undefined,
        },
      },
    ],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length > 0,
      message: 'Order must have at least one item',
    },
  },

  shippingAddress: {
    name: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
  },

  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PLACED,
    index: true,
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true,
  },

  statusHistory: {
    type: [
      {
        status: { type: String, enum: Object.values(ORDER_STATUS), required: true },
        note: { type: String, default: '' },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },

  totals: {
    subtotal: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
  },

  couponCode: { type: String, default: null },
  // Prompt 19 Part 31 — the authoritative, immutable coupon snapshot. The
  // live Coupon document may later be disabled/edited/archived; historical
  // orders must remain correct regardless (Part 31/36), so nothing that
  // reads an order's discount (invoice, refund/return, this order's own
  // display) is ever allowed to re-fetch the CURRENT coupon definition.
  couponSnapshot: {
    // An explicit `new Schema(...)` instance (not a plain object literal) is
    // required here — Mongoose only supports `default: null` on a nested
    // path when `type` resolves to a real Schema/SchemaType, not a bare
    // object literal (which it would otherwise try to parse AS SchemaType
    // options themselves, including the sibling `default` key, and throw).
    type: new Schema(
      {
        couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
        code: { type: String, required: true },
        type: { type: String, required: true },
        value: { type: Number, required: true },
        maxDiscountAmount: { type: Number, default: null },
        discountAmount: { type: Number, required: true },
      },
      { _id: false },
    ),
    default: null,
  },
  prescriptionRequired: { type: Boolean, default: false },
  prescriptionVerified: { type: Boolean, default: false },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },

  // Prompt 16 Part 26/28 — a Return resolved as REPLACEMENT spawns a second,
  // fully traceable Order rather than mutating the original order's items
  // (Part 26: "must NOT simply modify the original order item quantity").
  // `default: null` on both — every order created before this prompt, and
  // every ordinary (non-replacement) order going forward, leaves these unset.
  originalOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  returnId: { type: Schema.Types.ObjectId, ref: 'Return', default: null },
  isReplacementOrder: { type: Boolean, default: false },
});

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// Prompt 2 (prepaid-only redesign) — at most ONE order may ever be created
// per Payment, enforced at the database level. Order finalization
// (order.service.ts's finalizeOrderFromDraft) relies on this to safely
// detect/resolve a concurrent frontend-verify + webhook race: the loser's
// `OrderModel.create()` throws a duplicate-key (E11000) error on THIS index,
// which is caught and treated as "already finalized by the other path" —
// never a second order for one payment. Partial (excludes null) so
// historical/legacy orders with no paymentId are unaffected.
orderSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } } },
);

auditPlugin(orderSchema);

export type OrderDocument = InferSchemaType<typeof orderSchema>;
export const OrderModel = model('Order', orderSchema);
