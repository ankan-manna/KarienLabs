import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * Prompt 19 Part 8/9/52 — pure, DB/Redis-free config shape + validation,
 * split out from coupon-config.service.ts for the same reason
 * prescription-config.util.ts is split from its service (Prompt 17): the
 * Configuration service transitively imports the Redis-backed
 * maintenance-mode cache, and importing that as a side effect of a plain
 * unit test opens a real Redis connection.
 */
export interface CouponConfig {
  /** Part 1/8 — the master switch. false hides/rejects the entire feature, backend included. */
  managementEnabled: boolean;
  /**
   * Part 15/52 — whether `coupon.firstOrderOnly` is actually enforced.
   * Kept OFF the `stacking` toggle deliberately: this codebase's cart/order
   * schema has exactly ONE coupon slot (`cart.couponCode` / `order.couponCode`
   * are single strings, not arrays) — "stacking" is already structurally
   * disabled today regardless of any config flag, so a
   * `stackingEnabled` toggle would control nothing real (Part 52 explicitly
   * warns against configuration switches for internal details that don't
   * change behavior). `firstOrderCouponEnabled`, by contrast, gates a real,
   * implemented business rule.
   */
  firstOrderCouponEnabled: boolean;
}

export const DEFAULT_COUPON_CONFIG: CouponConfig = {
  managementEnabled: true,
  firstOrderCouponEnabled: true,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_COUPON_CONFIG));

/** Part 52 — whitelist validation (unknown keys rejected) + the one real dependency rule (nothing coupon-related can stay "on" while the feature itself is off). */
export function validateCouponConfig(next: CouponConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown coupon configuration key: "${key}"`);
    }
  }
  if (!next.managementEnabled && next.firstOrderCouponEnabled) {
    throw new UnprocessableEntityError(
      'Cannot enable firstOrderCouponEnabled while coupon management is disabled',
    );
  }
}
