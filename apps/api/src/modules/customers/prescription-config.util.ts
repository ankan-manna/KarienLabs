import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * Pure, DB/Redis-free config shape + validation — deliberately split out
 * from prescription-config.service.ts (which imports the Configuration
 * service, which transitively imports the Redis-backed maintenance-mode
 * cache) so the whitelist/dependency validation logic (Part 40/43) is
 * unit-testable without opening a real Redis connection as an import side
 * effect (see prescription-config.service.test.ts).
 */
export interface PrescriptionConfig {
  /** Part 1/2 — the master switch. false disables the entire feature, backend included. */
  managementEnabled: boolean;
  /** Part 9 — customer-facing upload capability. */
  uploadEnabled: boolean;
  /** Part 14 — whether an Admin/pharmacist verification step is required at all. */
  verificationEnabled: boolean;
  /** Part 19 — may a customer select an existing valid prescription instead of re-uploading. */
  reuseEnabled: boolean;
  /**
   * Part 15/RX-01 — the documented fulfillment gate: a prescription-required
   * order cannot progress past PACKED while unverified. ON by default,
   * matching RX-01's plain reading (this is the actual missing enforcement
   * the task describes, not an opt-in nicety).
   */
  orderBlockingEnabled: boolean;
  /**
   * Part 7/8/16 — an ADDITIONAL, stricter gate at checkout/order-creation
   * time itself (vs. RX-01's fulfillment-time gate). OFF by default — the
   * documented RX-01 task explicitly frames the gate as fulfillment-only
   * ("no new field needed — enforcement logic only"); this exists as a real,
   * working toggle for a business that wants to go further, not a hardcoded
   * behavior.
   */
  checkoutUploadRequired: boolean;
  /** Part 20 — whether verified prescriptions lapse with age at all. */
  validityEnabled: boolean;
  /** Part 20 — the lapse window in days, only meaningful when validityEnabled. */
  validityDays: number;
}

export const DEFAULT_PRESCRIPTION_CONFIG: PrescriptionConfig = {
  managementEnabled: true,
  uploadEnabled: true,
  verificationEnabled: true,
  reuseEnabled: true,
  orderBlockingEnabled: true,
  checkoutUploadRequired: false,
  validityEnabled: true,
  validityDays: 180,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_PRESCRIPTION_CONFIG));

/**
 * Part 40 — whitelist/schema validation: an unknown key is rejected outright
 * rather than silently persisted. Part 43 — dependency validation: several
 * settings are meaningless (and forbidden) without `managementEnabled`.
 */
export function validatePrescriptionConfig(next: PrescriptionConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown prescription configuration key: "${key}"`);
    }
  }
  if (typeof next.validityDays !== 'number' || next.validityDays <= 0 || !Number.isFinite(next.validityDays)) {
    throw new UnprocessableEntityError('validityDays must be a positive number');
  }

  if (!next.managementEnabled) {
    const dependents: (keyof PrescriptionConfig)[] = [
      'uploadEnabled',
      'verificationEnabled',
      'reuseEnabled',
      'orderBlockingEnabled',
      'checkoutUploadRequired',
      'validityEnabled',
    ];
    const stillOn = dependents.filter((key) => next[key] === true);
    if (stillOn.length > 0) {
      throw new UnprocessableEntityError(
        `Cannot enable ${stillOn.join(', ')} while prescription management is disabled`,
      );
    }
  }
  // Part 43 — verification/reuse/order-blocking are meaningless without upload capability.
  if (!next.uploadEnabled && (next.verificationEnabled || next.reuseEnabled)) {
    throw new UnprocessableEntityError(
      'Cannot enable prescription verification or reuse while upload is disabled',
    );
  }
}
