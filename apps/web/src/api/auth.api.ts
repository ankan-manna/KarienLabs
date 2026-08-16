import type { ApiResponse, AuthUser } from '@medcommerce/shared';

import { apiBaseUrl, httpClient } from './http-client';

/** Response shape for endpoints that always issue a real session (register/refresh/verify-otp) — no `otpRequired` discriminant needed since they never return the challenge shape. */
interface SessionPayload {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

interface LoginAuthPayload extends SessionPayload {
  otpRequired: false;
}

/** Returned instead of `LoginAuthPayload` when `authentication.otp.login.enabled` is on — no session/cookie exists yet, the caller must complete `verifyLoginOtpRequest`. */
export interface LoginOtpChallenge {
  otpRequired: true;
  challengeToken: string;
  maskedContact: string;
  expiresAt: string;
  resendCooldownSeconds: number;
  /** Dev-mode convenience only — never present against a production API. */
  devOnlyCode?: string;
}

export type LoginResponse = LoginAuthPayload | LoginOtpChallenge;

interface RegisterAuthPayload extends SessionPayload {
  otpRequired: false;
}

/** Returned instead of `RegisterAuthPayload` when `registrationOtpEnabled` is on — no session/cookie exists yet, the caller must complete `verifyRegisterOtpRequest`. Same shape as `LoginOtpChallenge`, kept as its own type since the two challenge tokens are never interchangeable server-side. */
export interface RegisterOtpChallenge {
  otpRequired: true;
  challengeToken: string;
  maskedContact: string;
  expiresAt: string;
  resendCooldownSeconds: number;
  devOnlyCode?: string;
}

export type RegisterResponse = RegisterAuthPayload | RegisterOtpChallenge;

export interface MePayload {
  user: AuthUser;
  permissions: string[];
  isSuperAdmin: boolean;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function loginRequest(
  email: string,
  password: string,
  rememberMe = true,
): Promise<LoginResponse> {
  const { data } = await httpClient.post<ApiResponse<LoginResponse>>('/auth/login', {
    email,
    password,
    rememberMe,
  });
  return unwrap(data);
}

export async function verifyLoginOtpRequest(challengeToken: string, code: string) {
  const { data } = await httpClient.post<ApiResponse<SessionPayload>>('/auth/login/verify-otp', {
    challengeToken,
    code,
  });
  return unwrap(data);
}

export async function resendLoginOtpRequest(challengeToken: string) {
  const { data } = await httpClient.post<ApiResponse<Omit<LoginOtpChallenge, 'otpRequired' | 'challengeToken'>>>(
    '/auth/login/resend-otp',
    { challengeToken },
  );
  return unwrap(data);
}

export interface PublicAuthConfig {
  otpLoginEnabled: boolean;
  otpPasswordResetEnabled: boolean;
  googleAdminLoginEnabled: boolean;
}

/** Pre-authentication config the login/forgot-password pages need — whether to render the OTP step and the "Continue with Google" button. */
export async function authConfigRequest(): Promise<PublicAuthConfig> {
  const { data } = await httpClient.get<ApiResponse<PublicAuthConfig>>('/auth/auth-config');
  return unwrap(data);
}

/** Plain browser-navigation URL (not an axios call) — assign to `window.location.href` or an `<a href>`. */
export function googleLoginUrl(): string {
  return `${apiBaseUrl()}/auth/google`;
}

export async function registerRequest(
  name: string,
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const { data } = await httpClient.post<ApiResponse<RegisterResponse>>('/auth/register', {
    name,
    email,
    password,
  });
  return unwrap(data);
}

export async function verifyRegisterOtpRequest(challengeToken: string, code: string) {
  const { data } = await httpClient.post<ApiResponse<SessionPayload>>('/auth/register/verify-otp', {
    challengeToken,
    code,
  });
  return unwrap(data);
}

export async function resendRegisterOtpRequest(challengeToken: string) {
  const { data } = await httpClient.post<
    ApiResponse<Omit<RegisterOtpChallenge, 'otpRequired' | 'challengeToken'>>
  >('/auth/register/resend-otp', { challengeToken });
  return unwrap(data);
}

export async function refreshRequest() {
  const { data } = await httpClient.post<ApiResponse<SessionPayload>>('/auth/refresh');
  return unwrap(data);
}

export async function logoutRequest(): Promise<void> {
  await httpClient.post('/auth/logout');
}

export async function meRequest() {
  const { data } = await httpClient.get<ApiResponse<MePayload>>('/auth/me');
  return unwrap(data);
}

export async function forgotPasswordRequest(email: string) {
  const { data } = await httpClient.post<ApiResponse<{ requested: boolean }>>(
    '/auth/forgot-password',
    { email },
  );
  return unwrap(data);
}

/** Only used when `otpPasswordResetEnabled` is on. Returns a short-lived `resetSessionToken` to pass to `resetPasswordRequest` instead of an emailed link token. */
export async function forgotPasswordVerifyOtpRequest(email: string, code: string) {
  const { data } = await httpClient.post<ApiResponse<{ resetSessionToken: string }>>(
    '/auth/forgot-password/verify-otp',
    { email, code },
  );
  return unwrap(data);
}

/** Exactly one of `token` (emailed-link flow) or `resetSessionToken` (OTP flow) must be provided. */
export async function resetPasswordRequest(
  credentials: { token: string } | { resetSessionToken: string },
  password: string,
) {
  const { data } = await httpClient.post<ApiResponse<{ reset: boolean }>>('/auth/reset-password', {
    ...credentials,
    password,
  });
  return unwrap(data);
}

export async function requestEmailVerificationRequest() {
  const { data } = await httpClient.post<ApiResponse<{ requested: boolean }>>(
    '/auth/verify-email/request',
  );
  return unwrap(data);
}

export async function confirmEmailVerificationRequest(token: string) {
  const { data } = await httpClient.post<ApiResponse<{ verified: boolean }>>(
    '/auth/verify-email/confirm',
    { token },
  );
  return unwrap(data);
}

export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  const { data } = await httpClient.post<ApiResponse<{ changed: boolean }>>(
    '/auth/change-password',
    { currentPassword, newPassword },
  );
  return unwrap(data);
}

export interface Session {
  id: string;
  deviceInfo: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

export async function listSessionsRequest(): Promise<Session[]> {
  const { data } = await httpClient.get<ApiResponse<Session[]>>('/auth/sessions');
  return unwrap(data);
}

export async function revokeSessionRequest(sessionId: string): Promise<void> {
  await httpClient.delete(`/auth/sessions/${sessionId}`);
}
