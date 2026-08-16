import { ACTOR_TYPES, COUPON_AUDIT_ACTIONS, resolveProductDefaults } from '@medcommerce/shared';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import { validateCouponForCart, type ValidateCouponContext } from '../coupons/coupon-validation.service';
import { resolveCheckoutSeller } from '../orders/order.service';

import { CartModel } from './models/cart.model';

async function findOrCreateCartDoc(userId: string) {
  const cart = await CartModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );
  return cart;
}

export async function getMyCart(userId: string) {
  return findOrCreateCartDoc(userId);
}

export async function addCartItem(
  userId: string,
  input: { productId: string; variantId?: string | null; quantity: number },
) {
  const product = await ProductModel.findOne({ _id: input.productId, isActive: true }).lean();
  if (!product) throw new NotFoundError('Product');

  await findOrCreateCartDoc(userId);

  const existing = await CartModel.findOne({
    userId,
    'items.productId': input.productId,
    'items.variantId': input.variantId ?? null,
  });

  if (existing) {
    await CartModel.updateOne(
      { userId, 'items.productId': input.productId, 'items.variantId': input.variantId ?? null },
      { $inc: { 'items.$.quantity': input.quantity } },
    );
  } else {
    await CartModel.updateOne(
      { userId },
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

  return CartModel.findOne({ userId }).lean();
}

export async function updateCartItemQuantity(
  userId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
) {
  if (quantity === 0) {
    await CartModel.updateOne(
      { userId },
      { $pull: { items: { productId, variantId: variantId ?? null } } },
    );
  } else {
    const result = await CartModel.updateOne(
      { userId, 'items.productId': productId, 'items.variantId': variantId ?? null },
      { $set: { 'items.$.quantity': quantity } },
    );
    if (result.matchedCount === 0) throw new NotFoundError('Cart item');
  }
  return CartModel.findOne({ userId }).lean();
}

export async function removeCartItem(userId: string, productId: string, variantId: string | null) {
  await CartModel.updateOne(
    { userId },
    { $pull: { items: { productId, variantId: variantId ?? null } } },
  );
  return CartModel.findOne({ userId }).lean();
}

export async function clearCart(userId: string) {
  await CartModel.updateOne({ userId }, { $set: { items: [], couponCode: null } });
}

/**
 * Prompt 17 Part 7 — "the customer must know before payment," computed the
 * SAME way checkout() computes `order.prescriptionRequired` (the exact same
 * `resolveProductDefaults` tri-state inheritance — never a second,
 * independently-drifting prescription-requirement calculation) but exposed
 * as an early, non-blocking read so the cart/checkout UI can surface it
 * before the customer ever reaches payment.
 */
export async function getCartPrescriptionStatus(userId: string) {
  const cart = await findOrCreateCartDoc(userId);
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
 * Prompt 19 Part 19/21 — shared by applyCouponToCart AND
 * coupon.service.ts's previewCouponForCart (the `/coupons/validate`
 * dry-run endpoint), so "how do we turn a customer's cart into a coupon
 * validation context" is defined exactly once.
 */
export async function buildCouponContextFromCart(userId: string): Promise<ValidateCouponContext> {
  const cart = await findOrCreateCartDoc(userId);
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

  const cart = await findOrCreateCartDoc(userId);
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
  const cart = await findOrCreateCartDoc(userId);
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
