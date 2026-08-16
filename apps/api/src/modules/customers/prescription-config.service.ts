import { ACTOR_TYPES, PRESCRIPTION_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import {
  DEFAULT_PRESCRIPTION_CONFIG,
  validatePrescriptionConfig,
  type PrescriptionConfig,
} from './prescription-config.util';

export { DEFAULT_PRESCRIPTION_CONFIG, validatePrescriptionConfig, type PrescriptionConfig };

/**
 * Prompt 17's "MOST IMPORTANT ARCHITECTURAL RULE" (Part 1/5/38): every
 * prescription business behavior is read from HERE, never hardcoded at the
 * call site. Uses the EXISTING Configuration engine (`prescription`
 * namespace, Prompt 1's architecture) — not a second settings store, not
 * the separate FeatureFlags system (which already has an unrelated
 * `prescription_upload` rollout flag seeded from an earlier prompt; left
 * alone, untouched, per Part 54).
 */
export async function getPrescriptionConfig(): Promise<PrescriptionConfig> {
  const stored = (await getConfiguration('prescription')) as Partial<PrescriptionConfig>;
  return { ...DEFAULT_PRESCRIPTION_CONFIG, ...stored };
}

/** Part 1/8 — the single call every enforcement point (checkout, updateOrderStatus, upload, verification, reuse) goes through to know if the feature is even active. */
export async function isPrescriptionManagementEnabled(): Promise<boolean> {
  return (await getPrescriptionConfig()).managementEnabled;
}

/**
 * Part 2/40 — the ONLY write path for prescription configuration. Merges a
 * partial update onto the current persisted config (so a Platform Admin
 * flipping one toggle never has to resend the whole object), validates the
 * whitelist + dependencies BEFORE persisting, and audits both the generic
 * change and, specifically, the management on/off transition (Part 36).
 */
export async function setPrescriptionConfig(
  partial: Partial<PrescriptionConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<PrescriptionConfig> {
  const current = await getPrescriptionConfig();
  const next: PrescriptionConfig = { ...current, ...partial };
  validatePrescriptionConfig(next);

  await setConfiguration('prescription', next, actorId);

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  await recordAudit({
    actorId,
    actorType,
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_CONFIG_CHANGED,
    resource: 'prescription_config',
    resourceId: null,
    before: current,
    after: next,
  });

  if (current.managementEnabled !== next.managementEnabled) {
    await recordAudit({
      actorId,
      actorType: actorType ?? ACTOR_TYPES.SYSTEM,
      action: next.managementEnabled
        ? PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_FEATURE_ENABLED
        : PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_FEATURE_DISABLED,
      resource: 'prescription_config',
      resourceId: null,
    });
  }

  return next;
}
