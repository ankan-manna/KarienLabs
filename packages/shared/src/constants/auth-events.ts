/**
 * Actor/authentication-event vocabulary for Prompt 10 (OTP login, OTP password
 * reset, admin Google OAuth, actor-context audit logging). Consumed by
 * `AuditLogModel` (apps/api/src/modules/audit/models/audit-log.model.ts) via
 * its new optional `actorType`/`authenticationMethod` fields — this does NOT
 * introduce a parallel audit collection, only the shared vocabulary the
 * existing one now records for auth-related rows.
 */
export const AUTH_ACTIONS = {
  LOGIN_ATTEMPT: 'login_attempt',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  OTP_GENERATED: 'otp_generated',
  OTP_VERIFIED: 'otp_verified',
  OTP_FAILED: 'otp_failed',
  OTP_EXPIRED: 'otp_expired',
  OTP_RESEND: 'otp_resend',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_SUCCESS: 'password_reset_success',
  PASSWORD_RESET_FAILED: 'password_reset_failed',
  GOOGLE_LOGIN_SUCCESS: 'google_login_success',
  GOOGLE_LOGIN_FAILED: 'google_login_failed',
  LOGOUT: 'logout',
  TOKEN_REFRESH: 'token_refresh',
  SESSION_REVOKED: 'session_revoked',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',
  // Prompt 31 — registration-OTP gate. REGISTRATION_STARTED fires when an
  // account is created pending verification (OTP issuance itself is already
  // covered generically by OTP_GENERATED with metadata.purpose); the two
  // failure/blocked events below cover paths verifyOtp's own OTP_FAILED/
  // OTP_EXPIRED don't: a login attempt against a never-verified account, and
  // a serviceability/pincode-style hard rejection isn't relevant here so
  // only the login-block case needs its own action.
  REGISTRATION_STARTED: 'registration_started',
  REGISTRATION_SUCCESS: 'registration_success',
  LOGIN_BLOCKED_UNVERIFIED: 'login_blocked_unverified',
} as const;

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];

/** Who/what performed the action — kept distinct from `Role` (a User document field): a SYSTEM/WEBHOOK/BACKGROUND_JOB actor has no `role` at all. */
export const ACTOR_TYPES = {
  CUSTOMER: 'CUSTOMER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  SELLER: 'SELLER',
  SYSTEM: 'SYSTEM',
  WEBHOOK: 'WEBHOOK',
  BACKGROUND_JOB: 'BACKGROUND_JOB',
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

/** How the actor authenticated for this specific event/session — orthogonal to `actorType`. */
export const AUTH_METHODS = {
  PASSWORD: 'PASSWORD',
  PASSWORD_OTP: 'PASSWORD_OTP',
  GOOGLE_OAUTH: 'GOOGLE_OAUTH',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  SYSTEM: 'SYSTEM',
} as const;

export type AuthMethod = (typeof AUTH_METHODS)[keyof typeof AUTH_METHODS];

export const AUTH_RESULT = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;

export type AuthResult = (typeof AUTH_RESULT)[keyof typeof AUTH_RESULT];
