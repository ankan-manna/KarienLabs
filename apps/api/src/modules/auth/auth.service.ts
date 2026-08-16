import { randomUUID, randomBytes } from 'crypto';

import { AUTH_ACTIONS, NOTIFICATION_CHANNELS, ROLES } from '@medcommerce/shared';
import bcrypt from 'bcrypt';

import { env } from '../../config/env';
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  UnprocessableEntityError,
  ValidationError,
} from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { enqueueNotification } from '../notifications/notification.service';

import { recordAuthEvent } from './auth-audit.service';
import { getAuthConfig } from './auth-config.service';
import type { LoginInput, RegisterInput } from './auth.validator';
import { maskContact, resolveOtpContact } from './contact.util';
import {
  accessTokenExpiresAt,
  signAccessToken,
  signChallengeToken,
  verifyChallengeToken,
  type ChallengeTokenType,
} from './jwt.util';
import { RefreshTokenModel } from './models/refresh-token.model';
import { UserModel } from './models/user.model';
import { VERIFICATION_PURPOSES, VerificationTokenModel } from './models/verification-token.model';
import { issueOtp, verifyOtp } from './otp.service';
import { hashToken } from './token-hash.util';

const BCRYPT_COST = 12;
const REFRESH_TOKEN_BYTES = 64;

function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
}

interface SessionMeta {
  ip: string;
  deviceInfo: string;
  requestId?: string;
}

interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

async function issueTokenPair(
  userId: string,
  role: string,
  familyId: string,
  meta: SessionMeta,
): Promise<IssuedTokens> {
  const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const expiresAt = refreshTokenExpiry();

  await RefreshTokenModel.create({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId,
    deviceInfo: meta.deviceInfo,
    ip: meta.ip,
    expiresAt,
  });

  return {
    accessToken: signAccessToken({ sub: userId, role: role as never }),
    accessTokenExpiresAt: accessTokenExpiresAt(),
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

/** Wraps jsonwebtoken's throw-on-invalid `verifyChallengeToken` so callers get `null` uniformly for "expired", "bad signature", and "wrong typ" instead of having to catch a raw jsonwebtoken error alongside the "wrong typ" `null` case. */
function safeVerifyChallengeToken(token: string, expected: ChallengeTokenType) {
  try {
    return verifyChallengeToken(token, expected);
  } catch {
    return null;
  }
}

export type RegisterResult =
  | { otpRequired: false; user: InstanceType<typeof UserModel>; tokens: IssuedTokens }
  | {
      otpRequired: true;
      challengeToken: string;
      maskedContact: string;
      expiresAt: Date;
      resendCooldownSeconds: number;
      devOnlyCode?: string;
    };

/**
 * Prompt 31 — registration OTP always goes to the account's own email (the
 * only contact point that exists at registration time; no phone field on
 * `registerSchema`), regardless of the configured `otpChannel` used for
 * login/password-reset OTP.
 */
async function issueRegistrationOtp(
  user: InstanceType<typeof UserModel>,
  meta: SessionMeta,
  isResend: boolean,
): Promise<RegisterResult> {
  const otp = await issueOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.REGISTRATION_OTP,
    contact: user.email,
    channelOverride: NOTIFICATION_CHANNELS.EMAIL,
    isResend,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });
  const challengeToken = signChallengeToken(String(user._id), 'registration_otp_challenge');
  return {
    otpRequired: true,
    challengeToken,
    maskedContact: maskContact(user.email),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

/**
 * Part 8 — retrying `register()` with an email that already has a PENDING
 * (unverified) account resumes that registration instead of throwing
 * ConflictError. Deliberately never touches the existing user's `name`/
 * `passwordHash`: doing so would let an attacker who doesn't control the
 * mailbox silently overwrite the real registrant's chosen password ahead of
 * time, banking on the real owner completing OTP verification later and
 * unknowingly activating the attacker-set credentials. Only the OTP itself
 * (delivered to the one contact point an attacker can't intercept) moves.
 */
async function resumePendingRegistration(
  user: InstanceType<typeof UserModel>,
  meta: SessionMeta,
): Promise<RegisterResult> {
  const hasActiveOtp = await VerificationTokenModel.exists({
    userId: user._id,
    purpose: VERIFICATION_PURPOSES.REGISTRATION_OTP,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return issueRegistrationOtp(user, meta, Boolean(hasActiveOtp));
}

/**
 * When `registrationOtpEnabled` is on (Prompt 31, default ON — see
 * auth-config.service.ts), a new account is created but withheld real
 * session tokens until its email is OTP-verified (`verifyRegistrationOtp`
 * below); when off, behavior is byte-for-byte the pre-Prompt-22 flow
 * (immediate token issuance), so existing deployments/tests that never
 * touch this config are unaffected.
 */
export async function register(input: RegisterInput, meta: SessionMeta): Promise<RegisterResult> {
  const otpCfg = await getAuthConfig();
  const existing = await UserModel.findOne({ email: input.email, deletedAt: null });

  if (existing) {
    if (!otpCfg.registrationOtpEnabled || existing.emailVerified) {
      throw new ConflictError('An account with this email already exists');
    }
    return resumePendingRegistration(existing, meta);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: ROLES.CUSTOMER,
  });

  if (!otpCfg.registrationOtpEnabled) {
    const tokens = await issueTokenPair(user._id.toString(), user.role, randomUUID(), meta);
    return { otpRequired: false, user, tokens };
  }

  await recordAuthEvent({
    action: AUTH_ACTIONS.REGISTRATION_STARTED,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  return issueRegistrationOtp(user, meta, false);
}

/**
 * Exchanges a verified registration OTP for real session tokens — the
 * account-creation analogue of `verifyLoginOtp`. Marks `emailVerified: true`
 * so `login()`'s enforcement below (and any future check) sees this account
 * as fully activated.
 */
export async function verifyRegistrationOtp(
  challengeToken: string,
  code: string,
  meta: SessionMeta,
): Promise<VerifyLoginOtpResult> {
  const payload = safeVerifyChallengeToken(challengeToken, 'registration_otp_challenge');
  if (!payload) {
    throw new UnauthenticatedError('Registration session is invalid or has expired. Please register again.');
  }

  const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null });
  if (!user || !user.isActive) throw new UnauthenticatedError('Account is unavailable.');

  await verifyOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.REGISTRATION_OTP,
    code,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });

  user.emailVerified = true;
  await user.save();

  const tokens = await issueTokenPair(user._id.toString(), user.role, randomUUID(), meta);

  await recordAuthEvent({
    action: AUTH_ACTIONS.REGISTRATION_SUCCESS,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    authenticationMethod: 'PASSWORD_OTP',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  return { user, tokens };
}

export async function resendRegistrationOtp(challengeToken: string, meta: SessionMeta) {
  const payload = safeVerifyChallengeToken(challengeToken, 'registration_otp_challenge');
  if (!payload) {
    throw new UnauthenticatedError('Registration session is invalid or has expired. Please register again.');
  }

  const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null });
  if (!user || !user.isActive) throw new UnauthenticatedError('Account is unavailable.');
  if (user.emailVerified) throw new ConflictError('This account is already verified.');

  const otp = await issueOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.REGISTRATION_OTP,
    contact: user.email,
    channelOverride: NOTIFICATION_CHANNELS.EMAIL,
    isResend: true,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });

  return {
    maskedContact: maskContact(user.email),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export type LoginResult =
  | { otpRequired: false; user: InstanceType<typeof UserModel>; tokens: IssuedTokens }
  | {
      otpRequired: true;
      challengeToken: string;
      maskedContact: string;
      expiresAt: Date;
      resendCooldownSeconds: number;
      devOnlyCode?: string;
    };

/**
 * Credential check, unchanged in spirit from Prompt 1-9 — the only new
 * behavior is that when `authentication.otp.login.enabled` is on (Configuration
 * Engine, default OFF), a verified password does not yet issue tokens: it
 * issues an OTP and a short-lived challenge token, and the real session is
 * only created by `verifyLoginOtp` below (Prompt 10 Part 1).
 */
export async function login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
  const user = await UserModel.findOne({ email: input.email, deletedAt: null }).select(
    '+passwordHash',
  );

  await recordAuthEvent({
    action: AUTH_ACTIONS.LOGIN_ATTEMPT,
    userId: user ? String(user._id) : null,
    role: user?.role,
    email: input.email,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  const failLogin = async (failureReason: string) => {
    await recordAuthEvent({
      action: AUTH_ACTIONS.LOGIN_FAILED,
      userId: user ? String(user._id) : null,
      role: user?.role,
      email: input.email,
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
      success: false,
      failureReason,
    });
  };

  if (!user || !user.isActive) {
    await failLogin('invalid_credentials');
    throw new UnauthenticatedError('Invalid email or password');
  }

  if (user.isSuspended) {
    await failLogin('account_suspended');
    throw new UnauthenticatedError('This account has been suspended. Contact an administrator.');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await failLogin('account_locked');
    throw new UnauthenticatedError('Too many failed login attempts. Please try again later.');
  }

  const wasPreviouslyLocked = Boolean(user.lockedUntil);
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts += 1;
    let justLocked = false;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      justLocked = true;
    }
    await user.save();
    await failLogin('invalid_credentials');
    if (justLocked) {
      await recordAuthEvent({
        action: AUTH_ACTIONS.ACCOUNT_LOCKED,
        userId: String(user._id),
        role: user.role,
        email: user.email,
        name: user.name,
        ip: meta.ip,
        userAgent: meta.deviceInfo,
        requestId: meta.requestId,
        success: true,
        metadata: { lockedUntil: user.lockedUntil, failedLoginAttempts: user.failedLoginAttempts },
      });
    }
    throw new UnauthenticatedError('Invalid email or password');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  if (wasPreviouslyLocked) {
    await recordAuthEvent({
      action: AUTH_ACTIONS.ACCOUNT_UNLOCKED,
      userId: String(user._id),
      role: user.role,
      email: user.email,
      name: user.name,
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
      success: true,
    });
  }

  const otpCfg = await getAuthConfig();

  // Prompt 31 — an account created while `registrationOtpEnabled` was on but
  // never OTP-verified cannot log in. Scoped to CUSTOMER only: `register()`
  // (self-service, public) is the only creation path this OTP gate governs —
  // admin/seller/platform-admin accounts are created by an already-
  // authenticated admin (admin-user.service.ts) or the bootstrap seed script
  // (seed-super-admin.ts), neither of which sets `emailVerified`, so applying
  // this check to them would lock out every staff account by default rather
  // than gate public registration. Pre-existing customer accounts are
  // protected by the grandfather migration
  // (migrate-grandfather-verified-users.ts), which marks them
  // `emailVerified: true` before this check ships. Deliberately NOT counted
  // as a failed-password attempt (the password was correct) — does not touch
  // failedLoginAttempts/lockout state.
  if (otpCfg.registrationOtpEnabled && user.role === ROLES.CUSTOMER && !user.emailVerified) {
    await recordAuthEvent({
      action: AUTH_ACTIONS.LOGIN_BLOCKED_UNVERIFIED,
      userId: String(user._id),
      role: user.role,
      email: user.email,
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
      success: false,
      failureReason: 'email_not_verified',
    });
    throw new UnauthenticatedError(
      'Please verify your email to activate your account. Register again with this email to resend the verification code.',
    );
  }

  if (otpCfg.otpEnabled && otpCfg.otpLoginEnabled) {
    const { contact, channel } = resolveOtpContact(user, otpCfg.otpChannel);
    const otp = await issueOtp({
      userId: String(user._id),
      role: user.role,
      purpose: VERIFICATION_PURPOSES.LOGIN_OTP,
      contact,
      channelOverride: channel,
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
    });
    const challengeToken = signChallengeToken(String(user._id), 'login_otp_challenge');
    return {
      otpRequired: true,
      challengeToken,
      maskedContact: maskContact(contact),
      expiresAt: otp.expiresAt,
      resendCooldownSeconds: otp.resendCooldownSeconds,
      devOnlyCode: otp.devOnlyCode,
    };
  }

  const tokens = await issueTokenPair(user._id.toString(), user.role, randomUUID(), meta);

  await recordAuthEvent({
    action: AUTH_ACTIONS.LOGIN_SUCCESS,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    authenticationMethod: 'PASSWORD',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });
  // Legacy row shape kept for any existing dashboard/report querying `resource:'user', action:'login'` directly.
  await recordAudit({
    actorId: String(user._id),
    action: 'login',
    resource: 'user',
    resourceId: String(user._id),
    after: { success: true, ip: meta.ip },
    ip: meta.ip,
  });

  return { otpRequired: false, user, tokens };
}

export interface VerifyLoginOtpResult {
  user: InstanceType<typeof UserModel>;
  tokens: IssuedTokens;
}

export async function verifyLoginOtp(
  challengeToken: string,
  code: string,
  meta: SessionMeta,
): Promise<VerifyLoginOtpResult> {
  const payload = safeVerifyChallengeToken(challengeToken, 'login_otp_challenge');
  if (!payload) throw new UnauthenticatedError('Login session is invalid or has expired. Please sign in again.');

  const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null });
  if (!user || !user.isActive || user.isSuspended) {
    throw new UnauthenticatedError('Account is unavailable.');
  }

  await verifyOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.LOGIN_OTP,
    code,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });

  const tokens = await issueTokenPair(user._id.toString(), user.role, randomUUID(), meta);

  await recordAuthEvent({
    action: AUTH_ACTIONS.LOGIN_SUCCESS,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    authenticationMethod: 'PASSWORD_OTP',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  return { user, tokens };
}

export async function resendLoginOtp(challengeToken: string, meta: SessionMeta) {
  const payload = safeVerifyChallengeToken(challengeToken, 'login_otp_challenge');
  if (!payload) throw new UnauthenticatedError('Login session is invalid or has expired. Please sign in again.');

  const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null });
  if (!user || !user.isActive) throw new UnauthenticatedError('Account is unavailable.');

  const otpCfg = await getAuthConfig();
  const { contact, channel } = resolveOtpContact(user, otpCfg.otpChannel);
  const otp = await issueOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.LOGIN_OTP,
    contact,
    channelOverride: channel,
    isResend: true,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });

  return {
    maskedContact: maskContact(contact),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

/**
 * Rotation-on-use refresh flow. If the presented token has already been rotated
 * (i.e. `replacedByTokenHash` is set) or is expired/revoked, the entire token family
 * is revoked — this is the theft-detection response: a stolen-and-reused token
 * invalidates every session descended from it, forcing full re-authentication.
 */
export async function refresh(presentedToken: string, meta: SessionMeta) {
  const tokenHash = hashToken(presentedToken);
  const record = await RefreshTokenModel.findOne({ tokenHash });

  if (!record) throw new UnauthenticatedError('Invalid refresh token');

  if (record.revokedAt || record.expiresAt < new Date()) {
    await RefreshTokenModel.updateMany(
      { familyId: record.familyId, revokedAt: null },
      { revokedAt: new Date() },
    );
    await recordAuthEvent({
      action: AUTH_ACTIONS.SESSION_REVOKED,
      userId: String(record.userId),
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
      success: true,
      failureReason: 'refresh_token_reuse_detected',
    });
    throw new UnauthenticatedError('Refresh token expired or reused — session revoked');
  }

  const user = await UserModel.findOne({ _id: record.userId, deletedAt: null });
  if (!user || !user.isActive) throw new UnauthenticatedError('Account unavailable');

  const tokens = await issueTokenPair(user._id.toString(), user.role, record.familyId, meta);

  record.revokedAt = new Date();
  record.replacedByTokenHash = hashToken(tokens.refreshToken);
  await record.save();

  await recordAuthEvent({
    action: AUTH_ACTIONS.TOKEN_REFRESH,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    authenticationMethod: 'REFRESH_TOKEN',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  return { user, tokens };
}

export async function logout(presentedToken: string, meta?: Partial<SessionMeta>): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  const record = await RefreshTokenModel.findOneAndUpdate(
    { tokenHash },
    { revokedAt: new Date() },
  );
  if (record) {
    await recordAudit({
      actorId: String(record.userId),
      action: 'logout',
      resource: 'user',
      resourceId: String(record.userId),
    });
    await recordAuthEvent({
      action: AUTH_ACTIONS.LOGOUT,
      userId: String(record.userId),
      ip: meta?.ip,
      userAgent: meta?.deviceInfo,
      requestId: meta?.requestId,
      success: true,
    });
  }
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await RefreshTokenModel.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
const VERIFY_TOKEN_TTL_HOURS = 24;

/**
 * Always succeeds from the caller's perspective, whether or not the email
 * exists — avoids leaking account existence (Prompt 10 Part 2 explicit
 * requirement, same as the pre-existing behavior). When
 * `authentication.otp.passwordReset.enabled` is on, sends an OTP instead of
 * the emailed reset link; the frontend already knows which flow to render
 * via `GET /auth/auth-config` (see auth-config.service.ts's
 * `getPublicAuthConfig`) before ever calling this endpoint.
 */
export async function requestPasswordReset(email: string, meta: SessionMeta): Promise<void> {
  const user = await UserModel.findOne({ email, deletedAt: null, isActive: true });

  await recordAuthEvent({
    action: AUTH_ACTIONS.PASSWORD_RESET_REQUESTED,
    userId: user ? String(user._id) : null,
    role: user?.role,
    email,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  if (!user) return;

  const otpCfg = await getAuthConfig();
  if (otpCfg.otpEnabled && otpCfg.otpPasswordResetEnabled) {
    const { contact, channel } = resolveOtpContact(user, otpCfg.otpChannel);
    await issueOtp({
      userId: String(user._id),
      role: user.role,
      purpose: VERIFICATION_PURPOSES.PASSWORD_RESET_OTP,
      contact,
      channelOverride: channel,
      ip: meta.ip,
      userAgent: meta.deviceInfo,
      requestId: meta.requestId,
    });
    return;
  }

  const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  await VerificationTokenModel.create({
    userId: user._id,
    purpose: VERIFICATION_PURPOSES.PASSWORD_RESET,
    tokenHash: hashToken(token),
    contact: user.email,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  });

  await enqueueNotification({
    channel: 'email',
    templateKey: 'password_reset',
    recipient: user.email,
    userId: String(user._id),
    data: { token, name: user.name },
  });
}

/** Same no-enumeration guarantee as `requestPasswordReset` — an unknown email produces the exact same "incorrect OTP" rejection as a real user entering the wrong code, rather than a distinguishable "no such account" error. */
export async function verifyPasswordResetOtp(email: string, code: string, meta: SessionMeta) {
  const user = await UserModel.findOne({ email, deletedAt: null, isActive: true });
  if (!user) throw new UnprocessableEntityError('Incorrect OTP. Please try again.');

  await verifyOtp({
    userId: String(user._id),
    role: user.role,
    purpose: VERIFICATION_PURPOSES.PASSWORD_RESET_OTP,
    code,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
  });

  const resetSessionToken = signChallengeToken(String(user._id), 'password_reset_session');
  return { resetSessionToken };
}

interface ResetPasswordInput {
  token?: string;
  resetSessionToken?: string;
  password: string;
}

export async function resetPassword(input: ResetPasswordInput, meta: SessionMeta): Promise<void> {
  let userId: string;

  if (input.resetSessionToken) {
    const payload = safeVerifyChallengeToken(input.resetSessionToken, 'password_reset_session');
    if (!payload) {
      await recordAuthEvent({
        action: AUTH_ACTIONS.PASSWORD_RESET_FAILED,
        ip: meta.ip,
        userAgent: meta.deviceInfo,
        requestId: meta.requestId,
        success: false,
        failureReason: 'reset_session_invalid_or_expired',
      });
      throw new UnprocessableEntityError('Reset session is invalid or has expired');
    }
    userId = payload.sub;
  } else if (input.token) {
    const record = await VerificationTokenModel.findOne({
      tokenHash: hashToken(input.token),
      purpose: VERIFICATION_PURPOSES.PASSWORD_RESET,
      consumedAt: null,
    });
    if (!record || record.expiresAt < new Date()) {
      await recordAuthEvent({
        action: AUTH_ACTIONS.PASSWORD_RESET_FAILED,
        ip: meta.ip,
        userAgent: meta.deviceInfo,
        requestId: meta.requestId,
        success: false,
        failureReason: 'reset_link_invalid_or_expired',
      });
      throw new UnprocessableEntityError('Reset link is invalid or has expired');
    }
    userId = String(record.userId);
    record.consumedAt = new Date();
    await record.save();
  } else {
    throw new ValidationError('A reset token or reset session is required');
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundError('User');

  user.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  await user.save();

  // A password reset is exactly the theft-recovery scenario the refresh-token
  // family design exists for — kill every existing session, not just this device's.
  await logoutAllSessions(String(user._id));

  await recordAuthEvent({
    action: AUTH_ACTIONS.PASSWORD_RESET_SUCCESS,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  await enqueueNotification({
    channel: 'email',
    templateKey: 'password_reset_confirmation',
    recipient: user.email,
    userId: String(user._id),
    data: { name: user.name },
  });
}

export async function requestEmailVerification(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) throw new NotFoundError('User');
  if (user.emailVerified) return;

  const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  await VerificationTokenModel.create({
    userId: user._id,
    purpose: VERIFICATION_PURPOSES.EMAIL_VERIFICATION,
    tokenHash: hashToken(token),
    contact: user.email,
    expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });

  await enqueueNotification({
    channel: 'email',
    templateKey: 'email_verification',
    recipient: user.email,
    userId: String(user._id),
    data: { token, name: user.name },
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const record = await VerificationTokenModel.findOne({
    tokenHash: hashToken(token),
    purpose: VERIFICATION_PURPOSES.EMAIL_VERIFICATION,
    consumedAt: null,
  });
  if (!record || record.expiresAt < new Date()) {
    throw new UnprocessableEntityError('Verification link is invalid or has expired');
  }

  await UserModel.updateOne({ _id: record.userId }, { emailVerified: true });
  record.consumedAt = new Date();
  await record.save();
}

/** Change-password-while-logged-in — distinct from the forgot/reset-password email flow above. Requires the current password and revokes every other session (this one survives since the caller is mid-request on it). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentRawRefreshToken?: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthenticatedError('Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();

  const currentHash = currentRawRefreshToken ? hashToken(currentRawRefreshToken) : null;
  await RefreshTokenModel.updateMany(
    {
      userId,
      revokedAt: null,
      ...(currentHash ? { tokenHash: { $ne: currentHash } } : {}),
    },
    { revokedAt: new Date() },
  );
}

/** Login/device history for the admin profile screen — one row per refresh-token session (active + recently revoked/expired), newest first. */
export async function listSessions(userId: string, currentRawRefreshToken?: string) {
  const currentHash = currentRawRefreshToken ? hashToken(currentRawRefreshToken) : null;

  const sessions = await RefreshTokenModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('tokenHash deviceInfo ip createdAt expiresAt revokedAt')
    .lean();

  return sessions.map((s) => ({
    id: String(s._id),
    deviceInfo: s.deviceInfo,
    ip: s.ip,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    isCurrent: currentHash !== null && s.tokenHash === currentHash,
  }));
}

/** Called by auth.controller.ts's `/auth/google/callback` once `resolveGoogleAdminUser` has already validated identity/role/status — issues the same real access+refresh token pair as password login, just with `authenticationMethod: 'GOOGLE_OAUTH'` on the audit row. */
export async function completeGoogleAdminLogin(
  user: InstanceType<typeof UserModel>,
  meta: SessionMeta,
): Promise<IssuedTokens> {
  const tokens = await issueTokenPair(user._id.toString(), user.role, randomUUID(), meta);

  await recordAuthEvent({
    action: AUTH_ACTIONS.GOOGLE_LOGIN_SUCCESS,
    userId: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    authenticationMethod: 'GOOGLE_OAUTH',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: true,
  });

  return tokens;
}

/** For every rejected Google sign-in attempt (bad identity token, unauthorized email, disabled/suspended account, ...) — always attributed as a failed auth event even though no session/user context may be fully resolved. */
export async function recordGoogleLoginFailure(
  reason: string,
  meta: SessionMeta,
  email?: string,
  userId?: string,
): Promise<void> {
  await recordAuthEvent({
    action: AUTH_ACTIONS.GOOGLE_LOGIN_FAILED,
    userId: userId ?? null,
    email,
    authenticationMethod: 'GOOGLE_OAUTH',
    ip: meta.ip,
    userAgent: meta.deviceInfo,
    requestId: meta.requestId,
    success: false,
    failureReason: reason,
  });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await RefreshTokenModel.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (result.matchedCount === 0) throw new NotFoundError('Session');

  await recordAuthEvent({
    action: AUTH_ACTIONS.SESSION_REVOKED,
    userId,
    success: true,
    metadata: { sessionId },
  });
}
