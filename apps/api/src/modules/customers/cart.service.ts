import { ACTOR_TYPES, COUPON_AUDIT_ACTIONS, resolveProductDefaults } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import { validateCouponForCart, type ValidateCouponContext } from '../coupons/coupon-validation.service';
import { resolveCheckoutSeller } from '../orders/order.service';

import { CartModel } from './models/cart.model';

/** A cart is owned by exactly one of these — a logged-in user's `userId`, or
 * an anonymous visitor's server-issued `sessionId` (see
 * `guest-cart.middleware.ts`). Every cart read/write in this file takes one
 * of these instead of a bare `userId` string so the same code path serves
 * both guests and authenticated customers; coupon application is the one
 * exception (still `userId`-only — see `cart.routes.ts`). */
export type CartOwner = { userId: string } | { sessionId: string };

async function findOrCreateCartDoc(owner: CartOwner) {
  const cart = await CartModel.findOneAndUpdate(
    owner,
    { $setOnInsert: owner },
    { upsert: true, new: true },
  );
  return cart;
}

export async function getMyCart(owner: CartOwner) {
  return findOrCreateCartDoc(owner);
}

export async function addCartItem(
  owner: CartOwner,
  input: { productId: string; variantId?: string | null; quantity: number },
) {
  const product = await ProductModel.findOne({ _id: input.productId, isActive: true }).lean();
  if (!product) throw new NotFoundError('Product');

  await findOrCreateCartDoc(owner);

  const existing = await CartModel.findOne({
    ...owner,
    'items.productId': input.productId,
    'items.variantId': input.variantId ?? null,
  });

  if (existing) {
    await CartModel.updateOne(
      { ...owner, 'items.productId': input.productId, 'items.variantId': input.variantId ?? null },
      { $inc: { 'items.$.quantity': input.quantity } },
    );
  } else {
    await CartModel.updateOne(
      owner,
      {
        $push: {
          items: {
            productId: input.productId,
            variantId: input.variantId ?? null,
            quantity: input.quantity,
            priceAtAdd: product.basePrice,
          },
        },
      },
    );
  }

  return CartModel.findOne(owner).lean();
}

export async function updateCartItemQuantity(
  owner: CartOwner,
  productId: string,
  variantId: string | null,
  quantity: number,
) {
  if (quantity === 0) {
    await CartModel.updateOne(
      owner,
      { $pull: { items: { productId, variantId: variantId ?? null } } },
    );
  } else {
    const result = await CartModel.updateOne(
      { ...owner, 'items.productId': productId, 'items.variantId': variantId ?? null },
      { $set: { 'items.$.quantity': quantity } },
    );
    if (result.matchedCount === 0) throw new NotFoundError('Cart item');
  }
  return CartModel.findOne(owner).lean();
}

export async function removeCartItem(owner: CartOwner, productId: string, variantId: string | null) {
  await CartModel.updateOne(
    owner,
    { $pull: { items: { productId, variantId: variantId ?? null } } },
  );
  return CartModel.findOne(owner).lean();
}

export async function clearCart(owner: CartOwner) {
  await CartModel.updateOne(owner, { $set: { items: [], couponCode: null } });
}

/**
 * Part 7 — "the customer must know before payment," computed the
 * SAME way checkout() computes `order.prescriptionRequired` (the exact same
 * `resolveProductDefaults` tri-state inheritance — never a second,
 * independently-drifting prescription-requirement calculation) but exposed
 * as an early, non-blocking read so the cart/checkout UI can surface it
 * before the customer ever reaches payment.
 */
export async function getCartPrescriptionStatus(owner: CartOwner) {
  const cart = await findOrCreateCartDoc(owner);
  if (cart.items.length === 0) return { requiresPrescription: false, items: [] };

  const products = await ProductModel.find({ _id: { $in: cart.items.map((i) => i.productId) } }).lean();
  const categories = await CategoryModel.find({
    _id: { $in: products.map((p) => p.categoryId) },
  }).lean();
  const categoryMap = new Map(categories.map((c) => [String(c._id), c]));

  const items = products.map((product) => ({
    productId: String(product._id),
    name: product.name,
    requiresPrescription: resolveProductDefaults(product, categoryMap.get(String(product.categoryId)))
      .requiresPrescription,
  }));

  return {
    requiresPrescription: items.some((i) => i.requiresPrescription),
    items: items.filter((i) => i.requiresPrescription),
  };
}

/**
 * Part 19/21 — shared by applyCouponToCart AND
 * coupon.service.ts's previewCouponForCart (the `/coupons/validate`
 * dry-run endpoint), so "how do we turn a customer's cart into a coupon
 * validation context" is defined exactly once. `userId`-only (not
 * `CartOwner`) — coupon routes stay `requireAuth`-gated, see cart.routes.ts.
 */
export async function buildCouponContextFromCart(userId: string): Promise<ValidateCouponContext> {
  const cart = await findOrCreateCartDoc({ userId });
  if (cart.items.length === 0) throw new UnprocessableEntityError('Cart is empty');

  const products = await ProductModel.find({
    _id: { $in: cart.items.map((i) => i.productId) },
  }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const { sellerId } = await resolveCheckoutSeller();

  const lines = cart.items.map((item) => {
    const product = productMap.get(String(item.productId));
    return {
      productId: String(item.productId),
      categoryId: product ? String(product.categoryId) : '',
      lineSubtotal: item.priceAtAdd * item.quantity,
    };
  });

  return {
    userId,
    cartTotal: lines.reduce((sum, l) => sum + l.lineSubtotal, 0),
    sellerId: sellerId ? String(sellerId) : null,
    lines,
  };
}

/**
 * Part 21 — validates against the SAME authoritative pipeline checkout()
 * re-runs later (Part 22), and returns the computed discount/allocation so
 * the cart UI can show a real preview immediately — never a
 * frontend-computed number (Part 21's explicit "frontend calculation is
 * for display only" — here it isn't even frontend-computed, it's the real
 * server result surfaced for display).
 */
export async function applyCouponToCart(userId: string, code: string) {
  const ctx = await buildCouponContextFromCart(userId);
  const result = await validateCouponForCart(code, ctx);

  const cart = await findOrCreateCartDoc({ userId });
  cart.couponCode = code.toUpperCase();
  await cart.save();

  await recordAudit({
    actorId: userId,
    actorType: ACTOR_TYPES.CUSTOMER,
    action: COUPON_AUDIT_ACTIONS.COUPON_APPLIED,
    resource: 'coupon',
    resourceId: String(result.coupon._id),
    metadata: { code: cart.couponCode, discountAmount: result.discountAmount },
  });

  return { cart: cart.toObject(), discountAmount: result.discountAmount, allocation: result.allocation };
}

/** Part 21/51 — the previously-missing counterpart to applyCouponToCart; a customer could apply but never remove a coupon before this. */
export async function removeCouponFromCart(userId: string) {
  const cart = await findOrCreateCartDoc({ userId });
  const previousCode = cart.couponCode;
  cart.couponCode = null;
  await cart.save();

  if (previousCode) {
    await recordAudit({
      actorId: userId,
      actorType: ACTOR_TYPES.CUSTOMER,
      action: COUPON_AUDIT_ACTIONS.COUPON_REMOVED,
      resource: 'coupon',
      resourceId: null,
      metadata: { code: previousCode },
    });
  }

  return cart.toObject();
}

/**
 * Guest-to-account cart merge, run once on successful login/register (see
 * `auth.controller.ts`) when a guest-cart cookie is present. Every guest
 * line is re-validated against the live catalog and re-priced from the
 * current `product.basePrice` — a guest's stored `priceAtAdd` is never
 * trusted or carried over as-is, same rule `addCartItem` already enforces.
 * Deleted/deactivated products are dropped silently rather than failing the
 * whole merge. Quantities for a product+variant pair already in the user's
 * cart are summed and capped at the existing per-line max (100) — the same
 * ceiling `addCartItemSchema` enforces on a normal add. The guest cart doc
 * is deleted once merged so a stale cookie can't be replayed to re-merge
 * the same items again. Callers MUST NOT let a failure here block
 * login/register — this is a convenience, not a prerequisite for auth.
 */
export async function mergeGuestCartIntoUserCart(sessionId: string, userId: string): Promise<void> {
  const guestCart = await CartModel.findOne({ sessionId });
  if (!guestCart || guestCart.items.length === 0) {
    if (guestCart) await CartModel.deleteOne({ _id: guestCart._id });
    return;
  }

  const MAX_QUANTITY = 100;
  const products = await ProductModel.find({
    _id: { $in: guestCart.items.map((i) => i.productId) },
    isActive: true,
  }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const userCart = await findOrCreateCartDoc({ userId });

  for (const guestItem of guestCart.items) {
    const product = productMap.get(String(guestItem.productId));
    if (!product) continue; // deleted/deactivated since it was added to the guest cart — drop it

    const matchIndex = userCart.items.findIndex(
      (i) =>
        String(i.productId) === String(guestItem.productId) &&
        String(i.variantId ?? '') === String(guestItem.variantId ?? ''),
    );

    if (matchIndex >= 0) {
      const combined = userCart.items[matchIndex].quantity + guestItem.quantity;
      userCart.items[matchIndex].quantity = Math.min(combined, MAX_QUANTITY);
      userCart.items[matchIndex].priceAtAdd = product.basePrice; // re-price even an already-existing line
    } else {
      userCart.items.push({
        productId: guestItem.productId,
        variantId: guestItem.variantId ?? null,
        quantity: Math.min(guestItem.quantity, MAX_QUANTITY),
        priceAtAdd: product.basePrice,
      });
    }
  }

  await userCart.save();
  await CartModel.deleteOne({ _id: guestCart._id });
  logger.info({ userId, mergedItemCount: guestCart.items.length }, 'Merged guest cart into user cart');
}
