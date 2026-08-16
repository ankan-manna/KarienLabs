import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_NOTIFICATION_CONFIG, validateNotificationConfig, type NotificationConfig } from './notification-config.util';

test('default config passes validation', () => {
  assert.doesNotThrow(() => validateNotificationConfig(DEFAULT_NOTIFICATION_CONFIG));
});

test('rejects an unknown configuration key', () => {
  const next = { ...DEFAULT_NOTIFICATION_CONFIG, unknownField: true } as unknown as NotificationConfig;
  assert.throws(() => validateNotificationConfig(next), /Unknown notification configuration key/);
});

test('a category toggle cannot stay on while the master switch is off', () => {
  const next: NotificationConfig = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    notificationsEnabled: false,
    orderNotificationsEnabled: true,
  };
  assert.throws(() => validateNotificationConfig(next), /Cannot enable orderNotificationsEnabled/);
});

test('multiple still-on category toggles are all listed in one error', () => {
  const next: NotificationConfig = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    notificationsEnabled: false,
  };
  assert.throws(() => validateNotificationConfig(next), /orderNotificationsEnabled.*paymentNotificationsEnabled|paymentNotificationsEnabled.*orderNotificationsEnabled/);
});

test('everything off (master + all categories) is a valid, safe transition', () => {
  const next: NotificationConfig = {
    notificationsEnabled: false,
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    pushEnabled: true,
    orderNotificationsEnabled: false,
    paymentNotificationsEnabled: false,
    shippingNotificationsEnabled: false,
    returnNotificationsEnabled: false,
    prescriptionNotificationsEnabled: false,
    adminNotificationsEnabled: false,
  };
  assert.doesNotThrow(() => validateNotificationConfig(next));
});

test('disabling only a single channel (email off, everything else default) is valid', () => {
  const next: NotificationConfig = { ...DEFAULT_NOTIFICATION_CONFIG, emailEnabled: false };
  assert.doesNotThrow(() => validateNotificationConfig(next));
});
