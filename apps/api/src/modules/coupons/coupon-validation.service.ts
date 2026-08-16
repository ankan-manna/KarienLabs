import { ORDER_STATUS } from '@medcommerce/shared';
import type { ClientSession, HydratedDocument } from 'mongoose';

import { AppError } from '../../utils/app-error';
import { OrderModel } from '../orders/models/order.model';

import { getCouponConfig } from './coupon-config.service';
import {
  calculateCouponDiscount,
  computeEligibleLines,
  type CartLine,
  type CouponRules,
} from './coupon-discount-calculation.util';
import { couponRepository } from './coupon.repository';
import { CouponUsageModel } from './models/coupon-usage.model';
import { CouponUserUsageCounterModel } from './models/coupon-user-usage-counter.model';
import { CouponModel, type CouponDocument } from './models/coupon.model';

export interface ValidateCouponContext {
  userId: string;
  /** Whole-cart GST-exclusive subtotal — the gate for `minCartValue` (Part 4), distinct from the ELIGIBLE subtotal the discount is actually calculated against (Part 12/13/30). */
  cartTotal: number;
  /** The checkout's resolved seller (order.service.ts's resolveCheckoutSeller), or null when none could be resolved. Required for seller-scoped coupons (Part 14). */
  sellerId: string | null;
  lines: CartLine[];
}

export interface CouponValidationResult {
  coupon: HydratedDocument<CouponDocument>;
  discountAmount: number;
  allocation: { productId: string; amount: number }[];
}

function toCouponRules(coupon: CouponDocument): CouponRules {
  return {
    type: coupon.type,
    value: coupon.value,
    maxDiscountAmount: coupon.maxDiscountAmount ?? null,
    applicableProductIds: coupon.applicableProductIds.map(String),
    applicableCategoryIds: coupon.applicableCategoryIds.map(String),
    excludedProductIds: (coupon.excludedProductIds ?? []).map(String),
  };
}

/**
 * Part 15 — "qualifying order" is deliberately defined narrowly and
 * server-side-only (never `customer.orderCount` from the frontend, per the
 * explicit instruction): any order that isn't CANCELLED counts as having
 * already ordered, even if it later failed payment/was refunded/returned —
 * the customer still went through checkout once, which is what
 * "first order" promotions exist to incentivize against. FAILED orders
 * (payment never completed) are the one exception a genuinely first-time
 * buyer could plausibly hit and retry, so those don't disqualify them.
 */
async function hasQualifyingPriorOrder(userId: string): Promise<boolean> {
  return Boolean(
    await OrderModel.exists({
      customerId: userId,
      status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED] },
    }),
  );
}

/**
 * Prompt 19 Part 19/20/22 — the SINGLE authoritative validation pipeline.
 * Called from cart.service.ts's applyCouponToCart, coupon.service.ts's
 * previewCouponForCart, AND order.service.ts's checkout() (which re-runs
 * this at order-creation time — Part 22's explicit "cart validation !=
 * final checkout validation" requirement) — never duplicated in any
 * controller.
 */
export async function validateCouponForCart(
  code: string,
  ctx: ValidateCouponContext,
): Promise<CouponValidationResult> {
  const config = await getCouponConfig();
  if (!config.managementEnabled) {
    throw new AppError(422, 'COUPON_FEATURE_DISABLED', 'Coupons are currently unavailable');
  }

  const coupon = await couponRepository.findByCode(code);
  if (!coupon) throw new AppError(404, 'COUPON_NOT_FOUND', 'This coupon code does not exist');
  if (!coupon.isActive) throw new AppError(422, 'COUPON_INACTIVE', 'This coupon is no longer active');

  const now = new Date();
  if (now < coupon.validFrom) {
    throw new AppError(422, 'COUPON_NOT_STARTED', 'This coupon is not active yet');
  }
  if (now > coupon.validTo) {
    throw new AppError(422, 'COUPON_EXPIRED', 'This coupon has expired');
  }

  if (coupon.sellerId && ctx.sellerId && String(coupon.sellerId) !== ctx.sellerId) {
    throw new AppError(422, 'COUPON_NOT_ELIGIBLE', 'This coupon is not applicable to your order');
  }

  if (ctx.cartTotal < coupon.minCartValue) {
    throw new AppError(
      422,
      'COUPON_MINIMUM_ORDER_NOT_MET',
      `A minimum order value of ₹${coupon.minCartValue} is required for this coupon`,
    );
  }

  if (coupon.applicableUserIds.length > 0) {
    const applies = coupon.applicableUserIds.some((u) => String(u) === ctx.userId);
    if (!applies) {
      throw new AppError(422, 'COUPON_NOT_ELIGIBLE', 'This coupon is not applicable to your account');
    }
  }

  if (coupon.firstOrderOnly && config.firstOrderCouponEnabled) {
    if (await hasQualifyingPriorOrder(ctx.userId)) {
      throw new AppError(422, 'COUPON_NOT_ELIGIBLE', 'This coupon is valid for your first order only');
    }
  }

  const eligibility = computeEligibleLines(toCouponRules(coupon), ctx.lines);
  if (eligibility.eligibleLines.length === 0) {
    throw new AppError(422, 'COUPON_NOT_ELIGIBLE', 'This coupon is not applicable to items in your cart');
  }

  // Fast, non-atomic pre-check — real UX value (fails fast before the
  // customer even reaches checkout) but NOT the authoritative concurrency
  // guard; that's recordCouponUsage's atomic conditional update, re-checked
  // unconditionally at order-creation time regardless of this result
  // (Part 17/22/42).
  if (coupon.usageLimitGlobal != null && coupon.usageCount >= coupon.usageLimitGlobal) {
    throw new AppError(422, 'COUPON_USAGE_LIMIT_REACHED', 'This coupon has reached its usage limit');
  }
  const userUsageCount = await CouponUsageModel.countDocuments({
    couponId: coupon._id,
    userId: ctx.userId,
  });
  if (userUsageCount >= coupon.usageLimitPerUser) {
    throw new AppError(422, 'COUPON_USER_LIMIT_REACHED', 'You have already used this coupon');
  }

  const { discountAmount, allocation } = calculateCouponDiscount(toCouponRules(coupon), eligibility);

  return { coupon, discountAmount, allocation };
}

/**
 * Prompt 19 Part 17/42/56 — the AUTHORITATIVE, concurrency-safe usage
 * commit. Must run inside the SAME transaction/session as order creation.
 * Both guards are atomic conditional updates — `findOneAndUpdate` with a
 * filter that re-checks the limit at write time, not a
 * read-then-write pair — so two simultaneous checkouts racing for the last
 * remaining use can never both succeed (MongoDB serializes concurrent
 * transactions writing the same document via write-conflict detection; the
 * loser's `withTransaction()` call is retried by the driver and will then
 * correctly fail the (now-updated) limit check). A failure here throws,
 * which aborts the WHOLE checkout transaction (order/stock/cart changes all
 * roll back together) — see order.service.ts's checkout().
 */
export async function recordCouponUsage(
  coupon: HydratedDocument<CouponDocument>,
  userId: string,
  orderId: string,
  discountApplied: number,
  allocation: { productId: string; amount: number }[],
  session: ClientSession,
): Promise<void> {
  // NOTE: no `$expr` here (unlike the global check below) — MongoDB
  // rejects `$expr` in an upsert's query predicate entirely
  // ("$expr is not allowed in the query predicate for an upsert").
  // `coupon.usageLimitPerUser` is already a known JS scalar at this point
  // (not a same-document field being compared to another field), so a
  // plain `$lt` comparison works and needs no `$expr` in the first place.
  const counterResult = await CouponUserUsageCounterModel.findOneAndUpdate(
    {
      couponId: coupon._id,
      userId,
      $or: [{ count: { $exists: false } }, { count: { $lt: coupon.usageLimitPerUser } }],
    },
    { $inc: { count: 1 }, $setOnInsert: { couponId: coupon._id, userId } },
    { session, upsert: true, new: true },
  );
  if (!counterResult) {
    throw new AppError(422, 'COUPON_USER_LIMIT_REACHED', 'You have already used this coupon');
  }

  const globalResult = await CouponModel.findOneAndUpdate(
    {
      _id: coupon._id,
      $or: [{ usageLimitGlobal: null }, { $expr: { $lt: ['$usageCount', '$usageLimitGlobal'] } }],
    },
    { $inc: { usageCount: 1 } },
    { session, new: true },
  );
  if (!globalResult) {
    throw new AppError(422, 'COUPON_USAGE_LIMIT_REACHED', 'This coupon has reached its usage limit');
  }

  await CouponUsageModel.create(
    [{ couponId: coupon._id, userId, orderId, discountApplied, allocation }],
    { session },
  );

  // Deliberately NOT auditing here — this runs INSIDE checkout()'s open
  // transaction, and an audit write isn't part of that transaction's
  // atomicity (same reasoning as order.service.ts's notifyOrderStatusChange,
  // which also runs after the transaction commits, not inside it). Auditing
  // here would risk a false "usage committed" record surviving even if a
  // LATER step in the same transaction fails and the whole order rolls
  // back. The caller (checkout()) records COUPON_USAGE_COMMITTED once the
  // transaction has actually committed successfully.
}
