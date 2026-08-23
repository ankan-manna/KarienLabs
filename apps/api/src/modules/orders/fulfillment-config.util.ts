import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * (post-payment fulfillment automation) — pure, DB/Redis-free
 * config shape + validation, split out from fulfillment-config.service.ts
 * for the same reason coupon-config.util.ts / prescription-config.util.ts
 * are split from their services (the Configuration service transitively
 * imports the Redis-backed maintenance-mode cache).
 *
 * Part 30 — every business behavior below is read from HERE at call time,
 * never hardcoded: the 6-hour interval, the batch size, and each pipeline
 * step's on/off switch are all Super-Admin-configurable through the
 * existing generic `Configuration` engine (`fulfillment` namespace),
 * exactly like every other feature-flag namespace in this codebase.
 */
export interface FulfillmentConfig {
  /** Part 30/31 — the master switch. false stops the sweep from enqueueing ANY new automated work; already-queued/in-flight jobs still finish. */
  automationEnabled: boolean;
  /** Part 27 — advancing PLACED->CONFIRMED->PACKED (which, unchanged, already triggers invoice generation via order.service.ts's updateOrderStatus). */
  orderAdvancementEnabled: boolean;
  /** Part 30 — Shiprocket order creation + AWB assignment step. */
  shippingAutomationEnabled: boolean;
  /** Part 30 — automatic label fetch immediately after AWB assignment, instead of only lazily on an admin's first download. */
  labelAutomationEnabled: boolean;
  /** Part 2 — target cadence in hours. Default 6 (00:00/06:00/12:00/18:00-equivalent cadence), Super-Admin-adjustable. */
  cronIntervalHours: number;
  /** Part 3 — the "30 minutes before/after" tolerance window used to decide whether a sweep tick is "due" yet. */
  toleranceMinutes: number;
  /** Part 24/48 — how many candidate orders one sweep pass loads into memory per page. */
  batchSize: number;
}

export const DEFAULT_FULFILLMENT_CONFIG: FulfillmentConfig = {
  automationEnabled: true,
  orderAdvancementEnabled: true,
  shippingAutomationEnabled: true,
  labelAutomationEnabled: true,
  cronIntervalHours: 6,
  toleranceMinutes: 30,
  batchSize: 50,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_FULFILLMENT_CONFIG));

export function validateFulfillmentConfig(next: FulfillmentConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown fulfillment configuration key: "${key}"`);
    }
  }
  if (!Number.isFinite(next.cronIntervalHours) || next.cronIntervalHours <= 0) {
    throw new UnprocessableEntityError('cronIntervalHours must be a positive number');
  }
  if (!Number.isFinite(next.toleranceMinutes) || next.toleranceMinutes < 0) {
    throw new UnprocessableEntityError('toleranceMinutes must be zero or a positive number');
  }
  if (next.toleranceMinutes >= next.cronIntervalHours * 60) {
    throw new UnprocessableEntityError('toleranceMinutes must be smaller than the cron interval itself');
  }
  if (!Number.isInteger(next.batchSize) || next.batchSize <= 0 || next.batchSize > 500) {
    throw new UnprocessableEntityError('batchSize must be a positive integer no greater than 500');
  }
}
