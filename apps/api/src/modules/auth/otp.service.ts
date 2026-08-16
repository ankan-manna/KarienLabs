import {
  AUTH_ACTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type Role,
} from '@medcommerce/shared';

import { TooManyRequestsError, UnprocessableEntityError } from '../../utils/app-error';
import { enqueueNotification } from '../notifications/notification.service';

import { recordAuthEvent } from './auth-audit.service';
import { getAuthConfig, type AuthConfig } from './auth-config.service';
import {
  OTP_CHANNELS,
  VERIFICATION_PURPOSES,
  VerificationTokenModel,
  type VerificationTokenDocument,
} from './models/verification-token.model';
import { generateOtpCode } from './otp.util';
import { hashesMatch, hashToken } from './token-hash.util';

type OtpPurpose =
  | typeof VERIFICATION_PURPOSES.LOGIN_OTP
  | typeof VERIFICATION_PURPOSES.PASSWORD_RESET_OTP
  // Prompt 21 Part 3 — `PHONE_VERIFICATION` was defined on
  // VERIFICATION_PURPOSES since Prompt 10 but never actually wired to
  // anything; this is that wiring. Reuses the SAME generic issueOtp/
  // verifyOtp pipeline (Part 3's explicit "do not create another OTP
  // system") — see modules/customers/profile.service.ts's
  // requestPhoneChange/confirmPhoneChange.
  | typeof VERIFICATION_PURPOSES.PHONE_VERIFICATION
  // Prompt 31 — gates registration; see register()/verifyRegistrationOtp() in auth.service.ts.
  | typeof VERIFICATION_PURPOSES.REGISTRATION_OTP
  // Prompt 31 — scoped to a single address, distinct from the account-level
  // PHONE_VERIFICATION above so the two flows never invalidate each other.
  | typeof VERIFICATION_PURPOSES.ADDRESS_MOBILE_VERIFICATION
  // Prompt 32 — guest-mode (no userId); see issueOtp/verifyOtp's scope-filter branch.
  | typeof VERIFICATION_PURPOSES.DISTRIBUTOR_ENQUIRY_VERIFICATION;

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  /** Threaded through purely so `recordAuthEvent` can resolve the correct `actorType` (Prompt 10 Part 4) — otp.service.ts has no independent way to look up a user's role, only auth.service.ts's callers do. */
  role?: Role;
}

interface IssueOtpInput extends RequestMeta {
  // Prompt 32 — omitted for guest purposes (currently only
  // DISTRIBUTOR_ENQUIRY_VERIFICATION); every existing authenticated purpose's
  // call sites are unaffected, they just keep passing a real userId.
  userId?: string;
  purpose: OtpPurpose;
  contact: string; // email (or phone, once phone-based delivery is exercised)
  channelOverride?: NotificationChannel;
  isResend?: boolean;
}

/**
 * Prompt 32 — every authenticated purpose scopes by `(userId, purpose)`
 * exactly as before; a guest purpose (no `userId`) scopes by `(contact,
 * purpose)` instead via the `{contact, purpose}` index on
 * VerificationTokenModel — `userId: null` alone would otherwise match every
 * OTHER guest's in-flight OTP for the same purpose.
 */
function scopeFilter(userId: string | undefined, contact: string): Record<string, unknown> {
  return userId ? { userId } : { userId: null, contact };
}

export interface IssueOtpResult {
  expiresAt: Date;
  expirySeconds: number;
  resendCooldownSeconds: number;
  maxResends: number;
  resendCount: number;
  /** Never the raw code — dev-mode convenience only, gated by NODE_ENV, so QA can test the OTP flow without a real SMS/WhatsApp provider wired up. Never present in production. */
  devOnlyCode?: string;
}

function templateKeyFor(purpose: OtpPurpose): string {
  switch (purpose) {
    case VERIFICATION_PURPOSES.LOGIN_OTP:
      return 'login_otp';
    // Address-mobile OTP reuses the account-phone-verification template
    // verbatim — the customer-facing copy doesn't need to differ by
    // purpose, only the internal `purpose` field (for OTP token isolation)
    // does.
    case VERIFICATION_PURPOSES.PHONE_VERIFICATION:
    case VERIFICATION_PURPOSES.ADDRESS_MOBILE_VERIFICATION:
      return 'phone_verification_otp';
    case VERIFICATION_PURPOSES.REGISTRATION_OTP:
      return 'registration_otp';
    case VERIFICATION_PURPOSES.DISTRIBUTOR_ENQUIRY_VERIFICATION:
      return 'distributor_enquiry_verification';
    default:
      return 'password_reset_otp';
  }
}

/** SMS/WhatsApp need a phone number; if the channel resolves to one of those but the contact given isn't a phone-shaped string, we already fell back to email at the call site (see resolveChannelAndContact in auth.service.ts) — this function trusts what it's given. */
async function deliverOtp(
  channel: NotificationChannel,
  contact: string,
  code: string,
  purpose: OtpPurpose,
  userId: string | undefined,
  expirySeconds: number,
): Promise<void> {
  await enqueueNotification({
    channel,
    templateKey: templateKeyFor(purpose),
    recipient: contact,
    userId,
    // Prompt 20 Part 5/34 — OTP is security-critical: it must never be
    // silently swallowed by a generic "notifications disabled" admin
    // toggle, which would lock every customer out of login/password-reset.
    // `critical: true` bypasses the notificationsEnabled master switch and
    // the AUTH category toggle (there isn't one); only a channel-level
    // outage (e.g. SMS provider down) can still block this send.
    category: NOTIFICATION_CATEGORIES.AUTH,
    critical: true,
    data: { code, expiryMinutes: Math.round(expirySeconds / 60) || 1 },
  });
}

/**
 * Generates (or resends) an OTP for LOGIN or PASSWORD_RESET, enforcing
 * cooldown/max-resend/config limits, and invalidates any prior un-consumed
 * OTP for the same (userId, purpose) — Prompt 10 Part 1/2/OTP-resend.
 */
export async function issueOtp(input: IssueOtpInput): Promise<IssueOtpResult> {
  const cfg = await getAuthConfig();

  const existing = await VerificationTokenModel.findOne({
    ...scopeFilter(input.userId, input.contact),
    purpose: input.purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  let resendCount = 0;

  if (input.isResend) {
    if (!existing) {
      throw new UnprocessableEntityError('No active OTP request found. Please start over.');
    }
    const lastSent = existing.lastSentAt ?? existing.createdAt;
    const elapsedMs = Date.now() - lastSent.getTime();
    const cooldownMs = cfg.otpResendCooldownSeconds * 1000;
    if (elapsedMs < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      throw new TooManyRequestsError(
        `Please wait ${retryAfterSeconds}s before requesting another OTP.`,
      );
    }
    if (existing.resendCount >= cfg.otpMaxResends) {
      await recordAuthEvent({
        action: AUTH_ACTIONS.OTP_RESEND,
        userId: input.userId,
        role: input.role,
        success: false,
        failureReason: 'max_resends_exceeded',
        ip: input.ip,
        userAgent: input.userAgent,
        requestId: input.requestId,
        metadata: { purpose: input.purpose },
      });
      throw new TooManyRequestsError(
        'Maximum OTP resend attempts reached. Please try again later.',
      );
    }
    resendCount = existing.resendCount + 1;
  }

  // Invalidate any prior un-consumed OTP for this (user, purpose) — a fresh
  // code always supersedes an old one rather than both being simultaneously valid.
  if (existing) {
    existing.consumedAt = new Date();
    await existing.save();
  }

  const channel = resolveOtpChannel(input.channelOverride, cfg.otpChannel);
  const code = generateOtpCode(cfg.otpLength);
  const expiresAt = new Date(Date.now() + cfg.otpExpirySeconds * 1000);

  await VerificationTokenModel.create({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: hashToken(code),
    contact: input.contact,
    channel: channelToOtpChannel(channel),
    maxAttempts: cfg.otpMaxAttempts,
    resendCount,
    lastSentAt: new Date(),
    expiresAt,
  });

  await deliverOtp(channel, input.contact, code, input.purpose, input.userId, cfg.otpExpirySeconds);

  await recordAuthEvent({
    action: input.isResend ? AUTH_ACTIONS.OTP_RESEND : AUTH_ACTIONS.OTP_GENERATED,
    userId: input.userId,
    role: input.role,
    success: true,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
    metadata: { purpose: input.purpose, channel }, // never the code itself
  });

  return {
    expiresAt,
    expirySeconds: cfg.otpExpirySeconds,
    resendCooldownSeconds: cfg.otpResendCooldownSeconds,
    maxResends: cfg.otpMaxResends,
    resendCount,
    devOnlyCode: process.env.NODE_ENV !== 'production' ? code : undefined,
  };
}

interface VerifyOtpInput extends RequestMeta {
  // Prompt 32 — omit for guest purposes; `contact` becomes required in that
  // case (enforced at runtime below, since TS can't express "exactly one of").
  userId?: string;
  contact?: string;
  purpose: OtpPurpose;
  code: string;
}

/**
 * Verifies a submitted OTP against the active (un-consumed) record for
 * (userId, purpose). On success: marks consumed + verified, resets nothing
 * else (attempt state is per-record, not per-user, so it naturally resets on
 * the next `issueOtp`). Throws on any failure mode (Prompt 10's OTP
 * verification checklist: exists / correct purpose / not expired / not
 * consumed / attempts not exceeded / matches).
 */
export async function verifyOtp(input: VerifyOtpInput): Promise<VerificationTokenDocument> {
  if (!input.userId && !input.contact) {
    throw new UnprocessableEntityError('No active OTP found. Please request a new one.');
  }

  const record = await VerificationTokenModel.findOne({
    ...scopeFilter(input.userId, input.contact ?? ''),
    purpose: input.purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  const fail = async (reason: string, message: string) => {
    await recordAuthEvent({
      action: reason === 'expired' ? AUTH_ACTIONS.OTP_EXPIRED : AUTH_ACTIONS.OTP_FAILED,
      userId: input.userId,
      role: input.role,
      success: false,
      failureReason: reason,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      metadata: { purpose: input.purpose },
    });
    throw new UnprocessableEntityError(message);
  };

  if (!record) return fail('no_active_otp', 'No active OTP found. Please request a new one.');

  if (record.expiresAt < new Date()) return fail('expired', 'This OTP has expired. Please request a new one.');

  if (record.attempts >= record.maxAttempts) {
    return fail(
      'max_attempts_exceeded',
      'Maximum verification attempts exceeded. Please request a new OTP.',
    );
  }

  const matches = hashesMatch(record.tokenHash, hashToken(input.code));
  if (!matches) {
    record.attempts += 1;
    await record.save();
    return fail('incorrect_code', 'Incorrect OTP. Please try again.');
  }

  record.consumedAt = new Date();
  record.verifiedAt = new Date();
  await record.save();

  await recordAuthEvent({
    action: AUTH_ACTIONS.OTP_VERIFIED,
    userId: input.userId,
    role: input.role,
    success: true,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
    metadata: { purpose: input.purpose },
  });

  return record;
}

function resolveOtpChannel(
  override: NotificationChannel | undefined,
  configured: AuthConfig['otpChannel'],
): NotificationChannel {
  if (override) return override;
  switch (configured) {
    case 'sms':
      return NOTIFICATION_CHANNELS.SMS;
    case 'whatsapp':
      return NOTIFICATION_CHANNELS.WHATSAPP;
    case 'email':
    default:
      return NOTIFICATION_CHANNELS.EMAIL;
  }
}

function channelToOtpChannel(channel: NotificationChannel): 'email' | 'sms' | 'whatsapp' {
  if (channel === NOTIFICATION_CHANNELS.SMS) return 'sms';
  if (channel === NOTIFICATION_CHANNELS.WHATSAPP) return 'whatsapp';
  return 'email';
}

export { VERIFICATION_PURPOSES, OTP_CHANNELS };
