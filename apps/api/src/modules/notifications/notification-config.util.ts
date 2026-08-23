import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * Part 14/15/47 — pure, DB/Redis-free config shape + validation,
 * split from notification-config.service.ts for the same reason every
 * other `*-config.util.ts` in this codebase is (prescription/coupon):
 * the Configuration service transitively imports the Redis-backed
 * maintenance-mode cache, and a plain unit test importing that as a side
 * effect would open a real Redis connection.
 */
export interface NotificationConfig {
  /** Part 14 — the master switch. Gates every category toggle below, but NEVER gates AUTH-category sends (OTP/security mail) — see notification.service.ts's enqueueNotification. */
  notificationsEnabled: boolean;
  /** Channel-level toggles — apply universally, INCLUDING to auth/OTP sends on that channel (Part 33: legitimate operational control, e.g. "SMS provider is down, stop trying it"). */
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  /** Category toggles — never apply to AUTH. */
  orderNotificationsEnabled: boolean;
  paymentNotificationsEnabled: boolean;
  shippingNotificationsEnabled: boolean;
  returnNotificationsEnabled: boolean;
  prescriptionNotificationsEnabled: boolean;
  adminNotificationsEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  notificationsEnabled: true,
  emailEnabled: true,
  smsEnabled: true,
  whatsappEnabled: true,
  pushEnabled: true,
  orderNotificationsEnabled: true,
  paymentNotificationsEnabled: true,
  shippingNotificationsEnabled: true,
  returnNotificationsEnabled: true,
  prescriptionNotificationsEnabled: true,
  adminNotificationsEnabled: true,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_NOTIFICATION_CONFIG));

const CATEGORY_TOGGLE_KEYS: (keyof NotificationConfig)[] = [
  'orderNotificationsEnabled',
  'paymentNotificationsEnabled',
  'shippingNotificationsEnabled',
  'returnNotificationsEnabled',
  'prescriptionNotificationsEnabled',
  'adminNotificationsEnabled',
];

/** Part 47 — whitelist validation + the one dependency rule: no category can stay "on" while the master switch is off. */
export function validateNotificationConfig(next: NotificationConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown notification configuration key: "${key}"`);
    }
  }
  if (!next.notificationsEnabled) {
    const stillOn = CATEGORY_TOGGLE_KEYS.filter((key) => next[key] === true);
    if (stillOn.length > 0) {
      throw new UnprocessableEntityError(
        `Cannot enable ${stillOn.join(', ')} while notifications are disabled`,
      );
    }
  }
}
