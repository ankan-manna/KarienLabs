import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * Prompt 22 Part 2/3/38/46 — pure, DB/Redis-free config shape + validation,
 * same split-file pattern as coupon-config.util.ts (Prompt 19) /
 * notification-config.util.ts (Prompt 20): configuration.service.ts
 * transitively imports the Redis-backed maintenance-mode cache, and
 * importing that as a side effect of a plain unit test opens a real Redis
 * connection.
 *
 * Design: ONE master switch plus a per-domain toggle for every analytics
 * area this module exposes. A Super Admin can hide a whole domain's
 * analytics from Platform Admins (Part 38: "Platform Admin sees only:
 * Enabled analytics modules... Controlled by Super Admin, Configuration,
 * RBAC/PBAC") without inventing a new RBAC permission per domain — this
 * mirrors the existing `RESOURCES.REPORTS` single-permission-gate design
 * (reports.routes.ts / analytics.routes.ts already share one permission),
 * with Configuration providing the finer per-domain granularity on top,
 * exactly as coupon/notification/prescription configuration does today.
 */
export interface AnalyticsConfig {
  /** Part 1/2 — master switch. false disables every analytics/report/dashboard endpoint below, backend-enforced (never just a hidden frontend widget). */
  analyticsEnabled: boolean;
  salesAnalyticsEnabled: boolean;
  orderAnalyticsEnabled: boolean;
  customerAnalyticsEnabled: boolean;
  productAnalyticsEnabled: boolean;
  categoryAnalyticsEnabled: boolean;
  inventoryAnalyticsEnabled: boolean;
  paymentAnalyticsEnabled: boolean;
  shippingAnalyticsEnabled: boolean;
  returnAnalyticsEnabled: boolean;
  refundAnalyticsEnabled: boolean;
  prescriptionAnalyticsEnabled: boolean;
  couponAnalyticsEnabled: boolean;
  taxAnalyticsEnabled: boolean;
  /** Prompt 34 — Distributor/Bulk Purchase enquiry analytics (Prompt 32's domain), gating the new /admin/analytics/distributor-enquiries + /admin/reports/distributor-enquiries endpoints, same pattern as every other domain toggle here. */
  distributorAnalyticsEnabled: boolean;
  /**
   * Prompt 34 Part 13/14 — whether the frontend loads Google Analytics 4 at
   * all. Deliberately reuses this SAME `analytics` Configuration namespace
   * (Part 14's explicit instruction) rather than a second config system —
   * even though GA tracks WEBSITE/user behavior and every other key here
   * gates DATABASE-driven business analytics (Part 24: two different data
   * sources), a Super Admin still wants one place to turn analytics on/off.
   * The GA4 Measurement ID itself is NOT stored here — that's build-time
   * frontend config (`VITE_GA_MEASUREMENT_ID`, see apps/web/src/lib/
   * analytics.ts), never a secret, but also not something this backend
   * config namespace needs to know or serve.
   */
  googleAnalyticsEnabled: boolean;
  /**
   * Part 37 — "Super Admin may have access to broader system-level
   * analytics." Platform health (DB/queue/memory/security-alert internals)
   * is materially more sensitive than a sales report, so it gets its own
   * toggle even though today it shares the same `reports:read` RBAC gate as
   * everything else — a Super Admin can turn this OFF for all Platform
   * Admins without touching the broader reports permission.
   */
  platformHealthAnalyticsEnabled: boolean;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  analyticsEnabled: true,
  salesAnalyticsEnabled: true,
  orderAnalyticsEnabled: true,
  customerAnalyticsEnabled: true,
  productAnalyticsEnabled: true,
  categoryAnalyticsEnabled: true,
  inventoryAnalyticsEnabled: true,
  paymentAnalyticsEnabled: true,
  shippingAnalyticsEnabled: true,
  returnAnalyticsEnabled: true,
  refundAnalyticsEnabled: true,
  prescriptionAnalyticsEnabled: true,
  couponAnalyticsEnabled: true,
  taxAnalyticsEnabled: true,
  distributorAnalyticsEnabled: true,
  // Off by default — GA involves sending data to an external third party,
  // so (unlike the internal-database-backed domains above, which are safe
  // to default on) this stays opt-in until a Super Admin deliberately
  // configures a measurement ID and enables it, consistent with this
  // codebase's existing precedent for external-integration toggles
  // (Google Admin OAuth, Shiprocket) defaulting off.
  googleAnalyticsEnabled: false,
  // Defaults OFF for ordinary Platform Admins' safety — this is the one
  // domain where "visible by default" is the wrong default given it exposes
  // operational/security internals; a Super Admin opts it in per-deployment.
  platformHealthAnalyticsEnabled: false,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_ANALYTICS_CONFIG));

/** Every toggle except the master switch itself — exported so the service layer's write path can auto-cascade a master-off transition without requiring the caller to enumerate all 13 domains by hand. */
export const ANALYTICS_DOMAIN_KEYS: Array<keyof AnalyticsConfig> = Object.keys(
  DEFAULT_ANALYTICS_CONFIG,
).filter((k) => k !== 'analyticsEnabled') as Array<keyof AnalyticsConfig>;
const DOMAIN_KEYS = ANALYTICS_DOMAIN_KEYS;

/** Part 46/52 — whitelist validation (unknown keys rejected) + the one real dependency rule: nothing domain-specific can stay "on" while the master switch is off. */
export function validateAnalyticsConfig(next: AnalyticsConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown analytics configuration key: "${key}"`);
    }
  }
  if (!next.analyticsEnabled) {
    const stillOn = DOMAIN_KEYS.filter((k) => next[k] === true);
    if (stillOn.length > 0) {
      throw new UnprocessableEntityError(
        `Cannot enable ${stillOn.join(', ')} while analytics is disabled`,
      );
    }
  }
}
