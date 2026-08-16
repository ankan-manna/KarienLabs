import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@medcommerce/shared';

import type { AuthConfig } from './auth-config.service';

interface ContactCapableUser {
  email: string;
  phone?: string | null;
}

/**
 * Resolves where an OTP actually goes: honors the configured channel
 * (sms/whatsapp/email) only when the user has a phone number on file (see
 * user.model.ts's `phone` field — optional, no phone-verification flow exists
 * yet), otherwise falls back to email so OTP delivery never silently fails
 * for the majority of accounts that only have an email address.
 */
export function resolveOtpContact(
  user: ContactCapableUser,
  configuredChannel: AuthConfig['otpChannel'],
): { contact: string; channel: NotificationChannel } {
  if ((configuredChannel === 'sms' || configuredChannel === 'whatsapp') && user.phone) {
    return {
      contact: user.phone,
      channel: configuredChannel === 'sms' ? NOTIFICATION_CHANNELS.SMS : NOTIFICATION_CHANNELS.WHATSAPP,
    };
  }
  return { contact: user.email, channel: NOTIFICATION_CHANNELS.EMAIL };
}

/** For API responses that mention where an OTP was sent, without fully exposing the address (e.g. "we sent a code to jo***@example.com"). */
export function maskContact(contact: string): string {
  if (contact.includes('@')) {
    const [local, domain] = contact.split('@');
    const visibleLen = Math.min(2, local.length);
    const visible = local.slice(0, visibleLen);
    return `${visible}${'*'.repeat(Math.max(1, local.length - visibleLen))}@${domain}`;
  }
  if (contact.length <= 2) return '*'.repeat(contact.length);
  return `${'*'.repeat(contact.length - 2)}${contact.slice(-2)}`;
}
