import { randomBytes } from 'crypto';

import type { CookieOptions, Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import { env, isProduction } from '../../config/env';
import { getEffectivePermissions } from '../../middlewares/rbac.middleware';
import { sendCreated, sendSuccess } from '../../utils/api-response';
import { NotFoundError, UnauthenticatedError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';

import { getPublicAuthConfig } from './auth-config.service';
import * as authService from './auth.service';
import type {
  ForgotPasswordVerifyOtpInput,
  LoginInput,
  LoginVerifyOtpInput,
  RegisterInput,
  RegisterVerifyOtpInput,
  ResetPasswordInput,
} from './auth.validator';
import {
  GoogleAdminResolutionError,
  buildGoogleConsentUrl,
  resolveGoogleAdminUser,
  verifyGoogleAuthCode,
} from './google-auth.service';
import { UserModel } from './models/user.model';

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

/** Short-lived CSRF-state cookie for the Google OAuth redirect round-trip (double-submit pattern) — scoped narrowly to the two Google routes, cleared as soon as the callback consumes it. */
const OAUTH_STATE_COOKIE = 'mc_oauth_state';
const OAUTH_STATE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax', // 'lax', not 'strict' — this cookie must survive the top-level redirect back from accounts.google.com
  path: '/api/v1/auth/google',
  maxAge: 10 * 60 * 1000,
};

function sessionMeta(req: Request) {
  return {
    ip: req.ip ?? '',
    deviceInfo: req.headers['user-agent'] ?? '',
    requestId: req.requestId,
  };
}

/** `persist: false` (unchecked "remember me") omits `expires`, making it a session
 * cookie the browser drops on close — the underlying token's server-side TTL is
 * unchanged either way, this only controls whether it survives a browser restart. */
function setRefreshCookie(res: Response, token: string, expiresAt: Date, persist: boolean) {
  res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, token, {
    ...REFRESH_COOKIE_OPTIONS,
    ...(persist ? { expires: expiresAt } : {}),
  });
}

function toPublicUser(user: {
  _id: unknown;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  isSuspended?: boolean;
  emailVerified?: boolean;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    isSuspended: user.isSuspended ?? false,
    emailVerified: user.emailVerified ?? false,
    // Prompt (Admin Profile) Part 3 — "Created date"; falls back to `now`
    // only for the type system's benefit (every real User document has
    // `createdAt` via the schema's `{ timestamps: true }`, this is never
    // actually hit in practice).
    createdAt: (user.createdAt ?? new Date()).toISOString(),
  };
}

/**
 * Two possible response shapes, discriminated by `otpRequired` (Prompt 31,
 * same discriminated pattern as `loginHandler` below):
 *  - `{ otpRequired: false, user, accessToken, accessTokenExpiresAt }` — the
 *    pre-Prompt-22 shape, used when `registrationOtpEnabled` is off; the old
 *    link-based `requestEmailVerification` fires exactly as it always has.
 *  - `{ otpRequired: true, challengeToken, maskedContact, expiresAt,
 *      resendCooldownSeconds }` — no session/cookie issued yet; the frontend
 *    must call `/auth/register/verify-otp` with the challengeToken + code.
 *    The old link-based email is deliberately NOT also sent in this case —
 *    the OTP IS the verification step, sending both would be redundant.
 */
export const registerHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, RegisterInput>, res) => {
    const result = await authService.register(req.body, sessionMeta(req));

    if (result.otpRequired) {
      return sendCreated(res, {
        otpRequired: true,
        challengeToken: result.challengeToken,
        maskedContact: result.maskedContact,
        expiresAt: result.expiresAt,
        resendCooldownSeconds: result.resendCooldownSeconds,
        ...(result.devOnlyCode ? { devOnlyCode: result.devOnlyCode } : {}),
      });
    }

    setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt, true);
    await authService.requestEmailVerification(String(result.user._id));
    return sendCreated(res, {
      otpRequired: false,
      user: toPublicUser(result.user),
      accessToken: result.tokens.accessToken,
      accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
    });
  },
);

export const registerVerifyOtpHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, RegisterVerifyOtpInput>, res) => {
    const { user, tokens } = await authService.verifyRegistrationOtp(
      req.body.challengeToken,
      req.body.code,
      sessionMeta(req),
    );
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, true);
    return sendSuccess(res, {
      user: toPublicUser(user),
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    });
  },
);

export const registerResendOtpHandler = asyncHandler(async (req: Request, res) => {
  const result = await authService.resendRegistrationOtp(req.body.challengeToken, sessionMeta(req));
  return sendSuccess(res, result);
});

/**
 * Two possible response shapes, discriminated by `otpRequired`:
 *  - `{ otpRequired: false, user, accessToken, accessTokenExpiresAt }` — same
 *    shape as before Prompt 10, when OTP login is disabled/not applicable.
 *  - `{ otpRequired: true, challengeToken, maskedContact, expiresAt,
 *      resendCooldownSeconds }` — no session/cookie issued yet; the frontend
 *    must call `/auth/login/verify-otp` with the challengeToken + code.
 */
export const loginHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, LoginInput>, res) => {
    const result = await authService.login(req.body, sessionMeta(req));

    if (result.otpRequired) {
      return sendSuccess(res, {
        otpRequired: true,
        challengeToken: result.challengeToken,
        maskedContact: result.maskedContact,
        expiresAt: result.expiresAt,
        resendCooldownSeconds: result.resendCooldownSeconds,
        ...(result.devOnlyCode ? { devOnlyCode: result.devOnlyCode } : {}),
      });
    }

    setRefreshCookie(
      res,
      result.tokens.refreshToken,
      result.tokens.refreshTokenExpiresAt,
      req.body.rememberMe ?? true,
    );
    return sendSuccess(res, {
      otpRequired: false,
      user: toPublicUser(result.user),
      accessToken: result.tokens.accessToken,
      accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
    });
  },
);

export const loginVerifyOtpHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, LoginVerifyOtpInput>, res) => {
    const { user, tokens } = await authService.verifyLoginOtp(
      req.body.challengeToken,
      req.body.code,
      sessionMeta(req),
    );
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, true);
    return sendSuccess(res, {
      user: toPublicUser(user),
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    });
  },
);

export const loginResendOtpHandler = asyncHandler(async (req: Request, res) => {
  const result = await authService.resendLoginOtp(req.body.challengeToken, sessionMeta(req));
  return sendSuccess(res, result);
});

export const refreshHandler = asyncHandler(async (req: Request, res) => {
  const presented = req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME];
  if (!presented) throw new UnauthenticatedError('Missing refresh token');

  const { user, tokens } = await authService.refresh(presented, sessionMeta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, true);
  return sendSuccess(res, {
    user: toPublicUser(user),
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  });
});

export const logoutHandler = asyncHandler(async (req: Request, res) => {
  const presented = req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME];
  if (presented) await authService.logout(presented, sessionMeta(req));
  res.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  return sendSuccess(res, { loggedOut: true });
});

export const forgotPasswordHandler = asyncHandler(async (req: Request, res) => {
  await authService.requestPasswordReset(req.body.email, sessionMeta(req));
  return sendSuccess(res, { requested: true });
});

export const forgotPasswordVerifyOtpHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, ForgotPasswordVerifyOtpInput>, res) => {
    const result = await authService.verifyPasswordResetOtp(
      req.body.email,
      req.body.code,
      sessionMeta(req),
    );
    return sendSuccess(res, result);
  },
);

export const resetPasswordHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, ResetPasswordInput>, res) => {
    await authService.resetPassword(req.body, sessionMeta(req));
    return sendSuccess(res, { reset: true });
  },
);

export const requestEmailVerificationHandler = asyncHandler(async (req: Request, res) => {
  await authService.requestEmailVerification(req.user!.id);
  return sendSuccess(res, { requested: true });
});

export const verifyEmailHandler = asyncHandler(async (req: Request, res) => {
  await authService.verifyEmail(req.body.token);
  return sendSuccess(res, { verified: true });
});

export const changePasswordHandler = asyncHandler(async (req: Request, res) => {
  const presented = req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME];
  await authService.changePassword(
    req.user!.id,
    req.body.currentPassword,
    req.body.newPassword,
    presented,
  );
  return sendSuccess(res, { changed: true });
});

/** Login/device history for the admin "Profile" screen. */
export const listSessionsHandler = asyncHandler(async (req: Request, res) => {
  const presented = req.cookies?.[env.REFRESH_TOKEN_COOKIE_NAME];
  return sendSuccess(res, await authService.listSessions(req.user!.id, presented));
});

export const revokeSessionHandler = asyncHandler(async (req: Request, res) => {
  await authService.revokeSession(req.user!.id, req.params.sessionId);
  return sendSuccess(res, { revoked: true });
});

/** Bootstrap endpoint the frontend calls once per session — user profile plus the
 * effective permission set the `Can` component and route guards check against. */
export const meHandler = asyncHandler(async (req: Request, res) => {
  const user = await UserModel.findOne({ _id: req.user!.id, deletedAt: null });
  if (!user) throw new NotFoundError('User');

  const isSuperAdmin = user.role === 'super_admin';
  const permissions = isSuperAdmin
    ? []
    : Array.from(await getEffectivePermissions(String(user._id), user.role));

  return sendSuccess(res, { user: toPublicUser(user), permissions, isSuperAdmin });
});

/** Public, pre-authentication config the frontend needs to decide which login/reset UI to render (OTP step, Google button) — no secrets, no thresholds, just booleans. See auth-config.service.ts. */
export const authConfigHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await getPublicAuthConfig());
});

/** Redirects the browser to Google's consent screen. 404s (as "not found" rather than "forbidden", to avoid confirming/denying the feature's existence to a prober) if Google admin login isn't enabled/configured. */
export const googleLoginHandler = asyncHandler(async (_req: Request, res) => {
  const cfg = await getPublicAuthConfig();
  if (!cfg.googleAdminLoginEnabled) throw new NotFoundError('Google sign-in');

  const state = randomBytes(24).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTIONS);
  return res.redirect(buildGoogleConsentUrl(state));
});

/**
 * Google redirects the browser back here with `code`+`state` (or `error` if
 * the user declined consent). On success, sets the same httpOnly refresh
 * cookie a normal login would and redirects into the SPA — the SPA's
 * existing "bootstrap session from refresh cookie" logic (AuthContext's
 * mount-time `refreshRequest()`) then picks it up with zero new
 * token-in-URL handling needed. On any failure, redirects back to /login
 * with a non-sensitive error code in the query string (no token, no PII).
 */
export const googleCallbackHandler = asyncHandler(async (req: Request, res) => {
  const meta = sessionMeta(req);
  const { code, state, error: googleError } = req.query as Record<string, string | undefined>;
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_COOKIE_OPTIONS.path });

  const redirectWithError = (reason: string) =>
    res.redirect(`${env.WEB_BASE_URL}/login?googleError=${encodeURIComponent(reason)}`);

  if (googleError) {
    await authService.recordGoogleLoginFailure('user_declined_consent', meta);
    return redirectWithError('access_denied');
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    await authService.recordGoogleLoginFailure('invalid_or_missing_oauth_state', meta);
    return redirectWithError('invalid_state');
  }

  try {
    const identity = await verifyGoogleAuthCode(code);
    const user = await resolveGoogleAdminUser(identity);
    const tokens = await authService.completeGoogleAdminLogin(user, meta);
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt, true);
    return res.redirect(`${env.WEB_BASE_URL}/admin/google-callback`);
  } catch (err) {
    if (err instanceof GoogleAdminResolutionError) {
      await authService.recordGoogleLoginFailure(err.reason, meta);
      return redirectWithError(err.reason);
    }
    await authService.recordGoogleLoginFailure('google_verification_failed', meta);
    return redirectWithError('google_verification_failed');
  }
});
