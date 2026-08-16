/**
 * Prompt 20 — coarse notification CATEGORIES, distinct from `templateKey`
 * (which identifies the specific message, e.g. `order_status_changed`).
 * Categories are what Configuration-level enable/disable toggles gate
 * (Part 14/15/47) and what `NotificationConfig` reasons about — a business
 * can turn off "prescription notifications" as a whole without touching
 * individual templates. `AUTH` is deliberately never gated by the
 * `notificationsEnabled` master switch or any category toggle (see
 * notification-config.util.ts) — OTP/security mail must remain
 * authoritative and undisableable via this generic config surface
 * (Part 5/34's "existing OTP flow remains authoritative").
 */
export const NOTIFICATION_CATEGORIES = {
  AUTH: 'auth',
  ORDER: 'order',
  PAYMENT: 'payment',
  SHIPPING: 'shipping',
  RETURN: 'return',
  PRESCRIPTION: 'prescription',
  ADMIN: 'admin',
  SYSTEM: 'system',
} as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const NOTIFICATION_AUDIT_ACTIONS = {
  NOTIFICATION_TEMPLATE_CREATED: 'NOTIFICATION_TEMPLATE_CREATED',
  NOTIFICATION_TEMPLATE_UPDATED: 'NOTIFICATION_TEMPLATE_UPDATED',
  NOTIFICATION_TEMPLATE_ACTIVATED: 'NOTIFICATION_TEMPLATE_ACTIVATED',
  NOTIFICATION_TEMPLATE_DEACTIVATED: 'NOTIFICATION_TEMPLATE_DEACTIVATED',
  NOTIFICATION_TEMPLATE_DELETED: 'NOTIFICATION_TEMPLATE_DELETED',
  NOTIFICATION_PROVIDER_UPDATED: 'NOTIFICATION_PROVIDER_UPDATED',
  NOTIFICATION_RETRY_TRIGGERED: 'NOTIFICATION_RETRY_TRIGGERED',
  NOTIFICATION_CONFIG_CHANGED: 'NOTIFICATION_CONFIG_CHANGED',
  NOTIFICATION_FEATURE_ENABLED: 'NOTIFICATION_FEATURE_ENABLED',
  NOTIFICATION_FEATURE_DISABLED: 'NOTIFICATION_FEATURE_DISABLED',
} as const;
export type NotificationAuditAction =
  (typeof NOTIFICATION_AUDIT_ACTIONS)[keyof typeof NOTIFICATION_AUDIT_ACTIONS];
