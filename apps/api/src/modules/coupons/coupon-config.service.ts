import { ACTOR_TYPES, COUPON_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import { DEFAULT_COUPON_CONFIG, validateCouponConfig, type CouponConfig } from './coupon-config.util';

export { DEFAULT_COUPON_CONFIG, validateCouponConfig, type CouponConfig };

/**
 * Part 8/9/53 — every coupon-management business behavior is read
 * from HERE, never hardcoded at the call site. Uses the EXISTING
 * Configuration engine (`coupon` namespace) — not a second settings store.
 */
export async function getCouponConfig(): Promise<CouponConfig> {
  const stored = (await getConfiguration('coupon')) as Partial<CouponConfig>;
  return { ...DEFAULT_COUPON_CONFIG, ...stored };
}

/** Part 8 — the single call every enforcement point (cart apply/remove, checkout, admin CRUD, customer listing) goes through to know if the feature is even active. */
export async function isCouponManagementEnabled(): Promise<boolean> {
  return (await getCouponConfig()).managementEnabled;
}

/** Part 53 — the ONLY write path for coupon configuration. Merges a partial update onto the current persisted config, validates, persists, and audits both the generic change and the on/off transition specifically. */
export async function setCouponConfig(
  partial: Partial<CouponConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<CouponConfig> {
  const current = await getCouponConfig();
  const next: CouponConfig = { ...current, ...partial };
  validateCouponConfig(next);

  await setConfiguration('coupon', next, actorId);

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  await recordAudit({
    actorId,
    actorType,
    action: COUPON_AUDIT_ACTIONS.COUPON_CONFIG_CHANGED,
    resource: 'coupon_config',
    resourceId: null,
    before: current,
    after: next,
  });

  if (current.managementEnabled !== next.managementEnabled) {
    await recordAudit({
      actorId,
      actorType: actorType ?? ACTOR_TYPES.SYSTEM,
      action: next.managementEnabled
        ? COUPON_AUDIT_ACTIONS.COUPON_FEATURE_ENABLED
        : COUPON_AUDIT_ACTIONS.COUPON_FEATURE_DISABLED,
      resource: 'coupon_config',
      resourceId: null,
    });
  }

  return next;
}
