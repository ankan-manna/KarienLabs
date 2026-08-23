import { env } from '../../config/env';
import { getConfiguration } from '../platform/configuration.service';

/**
 * Shape of the `authentication` Configuration namespace ( 10 Part 9),
 * stored/edited through the EXISTING Configuration Engine (superadmin
 * ConfigurationPage -> PUT /platform/configuration/authentication) — not a
 * parallel config system, just another flat-keyed namespace alongside the
 * pre-existing business/invoice/payment/shipping/email/sms/razorpay/
 * cloudinary/gst/cms ones (see packages/shared/src/constants/notifications.ts
 * and apps/web/.../ConfigurationPage.tsx's NAMESPACE_FIELDS). Field names
 * match  10's "OTP CONFIGURATION" section verbatim.
 */
export interface AuthConfig {
  otpEnabled: boolean;
  otpLoginEnabled: boolean;
  otpPasswordResetEnabled: boolean;
  otpLength: number;
  otpExpirySeconds: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpMaxResends: number;
  otpChannel: 'email' | 'sms' | 'whatsapp';
  googleAdminLoginEnabled: boolean;
  // gates OTP-verified registration (register() withholds real
  // session tokens until the code is confirmed). Deliberately its OWN
  // switch, independent of `otpEnabled` above: that master toggle exists
  // for OPTIONAL post-registration MFA convenience (login/reset OTP) on
  // otherwise-already-verified accounts, whereas this is mandatory identity
  // verification for NEW accounts — the two are unrelated concerns and a
  // super admin must be able to run registration verification without
  // opting into login-time OTP, or vice versa.
  registrationOtpEnabled: boolean;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  // Off by default — existing password-only login/reset keeps working
  // unchanged for every current deployment until a super admin opts in
  // ( 10 Part 12, backward compatibility).
  otpEnabled: false,
  otpLoginEnabled: false,
  otpPasswordResetEnabled: false,
  otpLength: 6,
  otpExpirySeconds: 300,
  otpMaxAttempts: 5,
  otpResendCooldownSeconds: 30,
  otpMaxResends: 5,
  otpChannel: 'email',
  googleAdminLoginEnabled: false,
  // On by default (unlike the flags above):  31's registration/address/
  // checkout verification requirements are treated as security-urgent, not
  // optional convenience — see the grandfather migration
  // (migrate-grandfather-verified-users.ts) that protects every EXISTING
  // account from being locked out before this ships.
  registrationOtpEnabled: true,
};

function isValidChannel(v: unknown): v is AuthConfig['otpChannel'] {
  return v === 'email' || v === 'sms' || v === 'whatsapp';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Merges the stored `authentication` config (any subset of fields, possibly none) over the defaults — so a partially-configured or never-touched namespace still yields a fully-populated, safe config rather than throwing/undefined. */
export async function getAuthConfig(): Promise<AuthConfig> {
  const raw = (await getConfiguration('authentication')) as Partial<
    Record<keyof AuthConfig, unknown>
  >;

  const googleAdminLoginEnabled = Boolean(raw.googleAdminLoginEnabled) && isGoogleOAuthConfigured();

  return {
    otpEnabled: raw.otpEnabled === undefined ? DEFAULT_AUTH_CONFIG.otpEnabled : Boolean(raw.otpEnabled),
    otpLoginEnabled:
      raw.otpLoginEnabled === undefined
        ? DEFAULT_AUTH_CONFIG.otpLoginEnabled
        : Boolean(raw.otpLoginEnabled),
    otpPasswordResetEnabled:
      raw.otpPasswordResetEnabled === undefined
        ? DEFAULT_AUTH_CONFIG.otpPasswordResetEnabled
        : Boolean(raw.otpPasswordResetEnabled),
    otpLength: clampInt(raw.otpLength, 4, 8, DEFAULT_AUTH_CONFIG.otpLength),
    otpExpirySeconds: clampInt(raw.otpExpirySeconds, 30, 3600, DEFAULT_AUTH_CONFIG.otpExpirySeconds),
    otpMaxAttempts: clampInt(raw.otpMaxAttempts, 1, 10, DEFAULT_AUTH_CONFIG.otpMaxAttempts),
    otpResendCooldownSeconds: clampInt(
      raw.otpResendCooldownSeconds,
      10,
      600,
      DEFAULT_AUTH_CONFIG.otpResendCooldownSeconds,
    ),
    otpMaxResends: clampInt(raw.otpMaxResends, 1, 10, DEFAULT_AUTH_CONFIG.otpMaxResends),
    otpChannel: isValidChannel(raw.otpChannel) ? raw.otpChannel : DEFAULT_AUTH_CONFIG.otpChannel,
    // Also requires actual OAuth credentials to be present — a super admin
    // flipping this flag on without GOOGLE_CLIENT_ID/SECRET configured
    // should not surface a button that can never work.
    googleAdminLoginEnabled,
    registrationOtpEnabled:
      raw.registrationOtpEnabled === undefined
        ? DEFAULT_AUTH_CONFIG.registrationOtpEnabled
        : Boolean(raw.registrationOtpEnabled),
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL);
}

/** Public, unauthenticated-safe subset the frontend needs before/without a session — whether to show the OTP step and the Google button. No limits/thresholds leaked (those aren't secret either, but the client has no use for them until an OTP is actually issued). */
export async function getPublicAuthConfig() {
  const cfg = await getAuthConfig();
  return {
    otpLoginEnabled: cfg.otpEnabled && cfg.otpLoginEnabled,
    otpPasswordResetEnabled: cfg.otpEnabled && cfg.otpPasswordResetEnabled,
    googleAdminLoginEnabled: cfg.googleAdminLoginEnabled,
    registrationOtpEnabled: cfg.registrationOtpEnabled,
  };
}
