import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface NotificationPreferences {
  orderUpdates: boolean;
  paymentUpdates: boolean;
  deliveryUpdates: boolean;
  offersAndAnnouncements: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

export interface CustomerProfile {
  userId: string;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  phone: string;
  medicalConditions: string[];
  allergies: string[];
  preferredLanguage: string;
  avatarUrl: string;
  notificationPreferences: NotificationPreferences;
}

// Prompt 21 Part 3 — `phone` is deliberately NOT patchable here anymore; it
// can only change via requestPhoneChange/confirmPhoneChange below (OTP-verified).
export type ProfilePatch = Partial<Pick<CustomerProfile, 'avatarUrl' | 'gender' | 'preferredLanguage'>> & {
  notificationPreferences?: Partial<NotificationPreferences>;
};

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function getMyExtendedProfile(): Promise<CustomerProfile> {
  const { data } = await httpClient.get<ApiResponse<CustomerProfile>>('/profile/me');
  return unwrap(data);
}

export async function updateMyExtendedProfile(patch: ProfilePatch): Promise<CustomerProfile> {
  const { data } = await httpClient.patch<ApiResponse<CustomerProfile>>('/profile/me', patch);
  return unwrap(data);
}

export interface RequestPhoneChangeResult {
  expiresAt: string;
  expirySeconds: number;
  resendCooldownSeconds: number;
  maxResends: number;
  resendCount: number;
  devOnlyCode?: string;
}

/** Part 3 — step 1 of the OTP-verified phone-change flow. */
export async function requestPhoneChange(phone: string): Promise<RequestPhoneChangeResult> {
  const { data } = await httpClient.post<ApiResponse<RequestPhoneChangeResult>>(
    '/profile/me/phone/request-change',
    { phone },
  );
  return unwrap(data);
}

/** Part 3 — step 2: verifies the OTP and persists the new phone number. */
export async function confirmPhoneChange(code: string): Promise<CustomerProfile> {
  const { data } = await httpClient.post<ApiResponse<CustomerProfile>>(
    '/profile/me/phone/confirm-change',
    { code },
  );
  return unwrap(data);
}

/** Part 35 — safe, reversible-by-admin self-deactivation (never a hard delete). */
export async function deactivateAccount(password: string, reason?: string): Promise<void> {
  const { data } = await httpClient.post<ApiResponse<{ deactivated: boolean }>>('/profile/me/deactivate', {
    password,
    reason,
  });
  unwrap(data);
}
