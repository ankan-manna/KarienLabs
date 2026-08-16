import { COUPON_AUDIT_ACTIONS, COUPON_TYPES, ROLES, type Role } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { buildCouponContextFromCart } from '../customers/cart.service';
import { OrderModel } from '../orders/models/order.model';
import { SellerModel } from '../sellers/models/seller.model';

import { getCouponConfig } from './coupon-config.service';
import { validateCouponForCart } from './coupon-validation.service';
import { couponRepository } from './coupon.repository';
import { CouponModel } from './models/coupon.model';

/** Part 39/47 — never trust `sellerId` from the frontend as-is; it must reference a real, existing Seller. */
async function assertValidSellerId(sellerId: unknown): Promise<void> {
  if (sellerId === undefined || sellerId === null) return;
  const exists = await SellerModel.exists({ _id: sellerId });
  if (!exists) throw new UnprocessableEntityError('sellerId does not reference an existing seller');
}

function assertCrossFieldRules(merged: { type?: string; value?: number; validFrom?: Date; validTo?: Date }): void {
  if (merged.type === COUPON_TYPES.PERCENTAGE && typeof merged.value === 'number' && merged.value > 100) {
    throw new UnprocessableEntityError('A percentage discount cannot exceed 100%');
  }
  if (
    merged.validFrom &&
    merged.validTo &&
    new Date(merged.validTo).getTime() <= new Date(merged.validFrom).getTime()
  ) {
    throw new UnprocessableEntityError('End date must be after the start date');
  }
}

export async function createCoupon(
  input: Record<string, unknown>,
  actorId: string,
  actorRole?: Role,
) {
  const code = String(input.code).toUpperCase();
  if (await couponRepository.findByCode(code))
    throw new ConflictError(`Coupon code "${code}" already exists`);

  assertCrossFieldRules(input as { type?: string; value?: number; validFrom?: Date; validTo?: Date });
  await assertValidSellerId(input.sellerId);

  const created = await couponRepository.create({ ...input, code, createdBy: actorId });

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: COUPON_AUDIT_ACTIONS.COUPON_CREATED,
    resource: 'coupon',
    resourceId: String(created._id),
    after: created,
  });

  return created;
}

export async function updateCoupon(
  id: string,
  input: Record<string, unknown>,
  actorId: string,
  actorRole?: Role,
) {
  const current = await couponRepository.findById(id);
  if (!current) throw new NotFoundError('Coupon');

  const patch: Record<string, unknown> = { ...input, updatedBy: actorId };
  if (input.code) patch.code = String(input.code).toUpperCase();

  assertCrossFieldRules({
    type: (input.type as string | undefined) ?? current.type,
    value: (input.value as number | undefined) ?? current.value,
    validFrom: (input.validFrom as Date | undefined) ?? current.validFrom,
    validTo: (input.validTo as Date | undefined) ?? current.validTo,
  });
  if ('sellerId' in input) await assertValidSellerId(input.sellerId);

  const updated = await couponRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Coupon');

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: COUPON_AUDIT_ACTIONS.COUPON_UPDATED,
    resource: 'coupon',
    resourceId: id,
    before: current,
    after: updated,
  });

  return updated;
}

export async function deleteCoupon(id: string, actorId: string, actorRole?: Role) {
  // Part 36 — soft delete only; a coupon referenced by historical orders
  // (order.couponSnapshot/couponCode) must remain readable. softDeleteById
  // is the same mechanism every other archivable entity in this codebase
  // uses (never a hard Mongo delete).
  const deleted = await couponRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Coupon');

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: COUPON_AUDIT_ACTIONS.COUPON_ARCHIVED,
    resource: 'coupon',
    resourceId: id,
  });
}

export async function getCouponById(id: string) {
  const coupon = await couponRepository.findById(id);
  if (!coupon) throw new NotFoundError('Coupon');
  return coupon;
}

export function listCoupons(query: ListQuery) {
  return couponRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function toggleCoupon(
  id: string,
  isActive: boolean,
  actorId: string,
  actorRole?: Role,
) {
  const updated = await couponRepository.updateById(id, { isActive, updatedBy: actorId });
  if (!updated) throw new NotFoundError('Coupon');

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: isActive ? COUPON_AUDIT_ACTIONS.COUPON_ACTIVATED : COUPON_AUDIT_ACTIONS.COUPON_DEACTIVATED,
    resource: 'coupon',
    resourceId: id,
  });

  return updated;
}

/** Redemption breakdown for a coupon — `usageCount`/`usageLimitGlobal` are maintained on the coupon document itself at redemption time; this adds the order-level detail (who used it, order totals, discount given). */
export async function getCouponAnalytics(id: string) {
  const coupon = await couponRepository.findById(id);
  if (!coupon) throw new NotFoundError('Coupon');

  const orders = await OrderModel.find({ couponCode: coupon.code })
    .sort({ createdAt: -1 })
    .select('orderNumber customerId totals status createdAt')
    .lean();

  const totalDiscountGiven = orders.reduce((sum, o) => sum + (o.totals?.discount ?? 0), 0);
  const totalOrderValue = orders.reduce((sum, o) => sum + (o.totals?.grandTotal ?? 0), 0);

  return {
    coupon,
    usageCount: coupon.usageCount,
    usageLimitGlobal: coupon.usageLimitGlobal,
    remainingGlobal:
      coupon.usageLimitGlobal != null ? Math.max(0, coupon.usageLimitGlobal - coupon.usageCount) : null,
    orderCount: orders.length,
    totalDiscountGiven,
    totalOrderValue,
    orders,
  };
}

/**
 * Customer-facing "available coupons" list — active, within its validity window, and
 * either open to everyone or explicitly targeted at this user. Excludes coupons the
 * user has already exhausted their personal usage-limit on (checked via redemption
 * count on their own orders, since usageCount on the coupon itself is the *global*
 * counter and doesn't distinguish between users).
 *
 * Part 8 — returns an empty list (rather than throwing) when coupon
 * management is disabled, which is exactly what makes the customer-facing
 * "Available Coupons" section render as empty/hidden without the frontend
 * needing its own copy of the feature flag.
 */
export async function listAvailableCoupons(userId: string) {
  if (!(await getCouponConfig()).managementEnabled) return [];

  const now = new Date();
  const coupons = await CouponModel.find({
    isActive: true,
    deletedAt: null,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    $or: [{ applicableUserIds: { $size: 0 } }, { applicableUserIds: userId }],
  })
    // Part 28 — deterministic priority ordering (highest first), tie-broken
    // by most-recently-created.
    .sort({ priority: -1, createdAt: -1 })
    .lean();

  const globallyEligible = coupons.filter(
    (c) => c.usageLimitGlobal == null || c.usageCount < c.usageLimitGlobal,
  );
  if (globallyEligible.length === 0) return [];

  const codes = globallyEligible.map((c) => c.code);
  const myUsage = await OrderModel.aggregate([
    { $match: { customerId: new mongoose.Types.ObjectId(userId), couponCode: { $in: codes } } },
    { $group: { _id: '$couponCode', count: { $sum: 1 } } },
  ]);
  const usageByCode = new Map(myUsage.map((row) => [row._id as string, row.count as number]));

  return globallyEligible.filter((c) => {
    const used = usageByCode.get(c.code) ?? 0;
    return c.usageLimitPerUser == null || used < c.usageLimitPerUser;
  });
}

/**
 * Prompt 19 Part 21/51 — the `/coupons/validate` dry-run: runs the SAME
 * authoritative pipeline as applyCouponToCart, against the customer's
 * current cart, WITHOUT persisting `cart.couponCode`. Lets the customer UI
 * show a real discount preview (and a real error message) before committing
 * to "apply."
 */
export async function previewCouponForCart(userId: string, code: string) {
  const ctx = await buildCouponContextFromCart(userId);
  const result = await validateCouponForCart(code, ctx);
  return { discountAmount: result.discountAmount, allocation: result.allocation };
}

/** Part 47 — used by the admin route gate: super_admin always retains coupon-management access even while the feature is configured off for everyone else (Part 9/54). */
export function isSuperAdminRole(role?: Role): boolean {
  return role === ROLES.SUPER_ADMIN;
}
