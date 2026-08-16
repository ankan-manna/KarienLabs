/**
 * Prompt 22 — named audit-action-string-per-domain, same pattern as
 * COUPON_AUDIT_ACTIONS (Prompt 19) / NOTIFICATION_AUDIT_ACTIONS (Prompt 20).
 */
export const ANALYTICS_AUDIT_ACTIONS = {
  ANALYTICS_CONFIG_CHANGED: 'ANALYTICS_CONFIG_CHANGED',
  ANALYTICS_FEATURE_ENABLED: 'ANALYTICS_FEATURE_ENABLED',
  ANALYTICS_FEATURE_DISABLED: 'ANALYTICS_FEATURE_DISABLED',
  /** Part 39 — bulk data extraction (Excel/PDF export) is the one analytics
   * access pattern sensitive enough to warrant its own audit record; routine
   * dashboard/report reads are covered by structured request logging
   * (Part 40/41) instead, to avoid flooding the audit collection with every
   * screen refresh. */
  ANALYTICS_REPORT_EXPORTED: 'ANALYTICS_REPORT_EXPORTED',
} as const;
export type AnalyticsAuditAction = (typeof ANALYTICS_AUDIT_ACTIONS)[keyof typeof ANALYTICS_AUDIT_ACTIONS];
