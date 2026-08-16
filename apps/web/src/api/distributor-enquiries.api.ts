import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export interface DistributorEnquiryPublicConfig {
  enquiryEnabled: boolean;
  otpRequired: boolean;
  emailNotificationsEnabled: boolean;
}

export async function getDistributorEnquiryConfig(): Promise<DistributorEnquiryPublicConfig> {
  const { data } = await httpClient.get<ApiResponse<DistributorEnquiryPublicConfig>>(
    '/distributor-enquiries/config',
  );
  return unwrap(data);
}

export interface DistributorEnquiryOtpChallenge {
  maskedContact: string;
  expiresAt: string;
  resendCooldownSeconds: number;
  devOnlyCode?: string;
}

export async function requestDistributorEnquiryOtp(email: string): Promise<DistributorEnquiryOtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<DistributorEnquiryOtpChallenge>>(
    '/distributor-enquiries/otp/request',
    { email },
  );
  return unwrap(data);
}

export async function resendDistributorEnquiryOtp(email: string): Promise<DistributorEnquiryOtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<DistributorEnquiryOtpChallenge>>(
    '/distributor-enquiries/otp/resend',
    { email },
  );
  return unwrap(data);
}

export async function verifyDistributorEnquiryOtp(
  email: string,
  code: string,
): Promise<{ contactVerificationToken: string }> {
  const { data } = await httpClient.post<ApiResponse<{ contactVerificationToken: string }>>(
    '/distributor-enquiries/otp/verify',
    { email, code },
  );
  return unwrap(data);
}

export interface RequestedProductInput {
  productId: string;
  requestedQuantity: number;
}

export interface CreateDistributorEnquiryInput {
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  gstin?: string;
  businessAddress: string;
  city: string;
  state: string;
  pincode: string;
  message?: string;
  requestedProducts?: RequestedProductInput[];
  contactVerificationToken?: string;
}

export interface DistributorEnquiryCreated {
  enquiryNumber: string;
  status: string;
  createdAt: string;
}

export async function createDistributorEnquiry(
  input: CreateDistributorEnquiryInput,
): Promise<DistributorEnquiryCreated> {
  const { data } = await httpClient.post<ApiResponse<DistributorEnquiryCreated>>(
    '/distributor-enquiries',
    input,
  );
  return unwrap(data);
}
