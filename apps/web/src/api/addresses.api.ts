import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface Address {
  _id: string;
  label: string;
  type: 'shipping' | 'billing' | 'both';
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isDefault: boolean;
  /** Prompt 31 — set by the backend after a successful Postal PIN Code cross-check; cleared automatically whenever `pincode` is edited. Never client-settable. */
  pincodeVerified: boolean;
  /** Prompt 31 — set by the backend after a successful mobile-OTP confirmation for THIS address; cleared automatically whenever `phone` is edited. Never client-settable. */
  mobileVerified: boolean;
}

export type AddressInput = Omit<
  Address,
  '_id' | 'isDefault' | 'line2' | 'pincodeVerified' | 'mobileVerified'
> & {
  isDefault?: boolean;
  line2?: string;
};

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function listAddresses(): Promise<Address[]> {
  const { data } = await httpClient.get<ApiResponse<Address[]>>('/addresses');
  return unwrap(data);
}

export async function createAddress(input: AddressInput): Promise<Address> {
  const { data } = await httpClient.post<ApiResponse<Address>>('/addresses', input);
  return unwrap(data);
}

export async function updateAddress(id: string, input: Partial<AddressInput>): Promise<Address> {
  const { data } = await httpClient.patch<ApiResponse<Address>>(`/addresses/${id}`, input);
  return unwrap(data);
}

export async function deleteAddress(id: string): Promise<void> {
  await httpClient.delete(`/addresses/${id}`);
}

export interface AddressMobileOtpChallenge {
  maskedContact: string;
  expiresAt: string;
  resendCooldownSeconds: number;
  devOnlyCode?: string;
}

export async function requestAddressMobileOtp(id: string): Promise<AddressMobileOtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<AddressMobileOtpChallenge>>(
    `/addresses/${id}/mobile-otp/request`,
  );
  return unwrap(data);
}

export async function confirmAddressMobileOtp(id: string, code: string): Promise<{ verified: boolean }> {
  const { data } = await httpClient.post<ApiResponse<{ verified: boolean }>>(
    `/addresses/${id}/mobile-otp/confirm`,
    { code },
  );
  return unwrap(data);
}

export interface AddressVerificationConfig {
  pincodeValidationEnabled: boolean;
  mobileVerificationEnabled: boolean;
  serviceabilityCheckEnabled: boolean;
}

/** Whether the backend currently ENFORCES pincode/mobile/serviceability checks — the frontend must not assume any of these are required (or show "verification required" messaging) without checking this first, since each is an independently super-admin-toggleable gate. */
export async function getAddressVerificationConfig(): Promise<AddressVerificationConfig> {
  const { data } = await httpClient.get<ApiResponse<AddressVerificationConfig>>(
    '/addresses/verification-config',
  );
  return unwrap(data);
}
