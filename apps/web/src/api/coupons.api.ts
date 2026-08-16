import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';

export interface Coupon {
  _id: string;
  code: string;
  description: string;
  type: 'flat' | 'percentage';
  value: number;
  maxDiscountAmount: number | null;
  minCartValue: number;
  usageLimitGlobal: number | null;
  usageLimitPerUser: number;
  usageCount: number;
  firstOrderOnly: boolean;
  priority: number;
  sellerId: string | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  applicableUserIds: string[];
  excludedProductIds: string[];
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export interface CouponInput {
  code: string;
  description?: string;
  type: 'flat' | 'percentage';
  value: number;
  maxDiscountAmount?: number | null;
  minCartValue?: number;
  usageLimitGlobal?: number | null;
  usageLimitPerUser?: number;
  firstOrderOnly?: boolean;
  priority?: number;
  sellerId?: string | null;
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  applicableUserIds?: string[];
  excludedProductIds?: string[];
  validFrom: string;
  validTo: string;
  isActive?: boolean;
}

export const couponApi = createCrudApi<Coupon, CouponInput, Partial<CouponInput>>('/coupons');

export interface CouponConfig {
  managementEnabled: boolean;
  firstOrderCouponEnabled: boolean;
}

export async function getCouponConfig(): Promise<CouponConfig> {
  const { data } = await httpClient.get<ApiResponse<CouponConfig>>('/coupons/config');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function setCouponConfig(partial: Partial<CouponConfig>): Promise<CouponConfig> {
  const { data } = await httpClient.put<ApiResponse<CouponConfig>>('/coupons/config', partial);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface CouponPreview {
  discountAmount: number;
  allocation: { productId: string; amount: number }[];
}

/** Part 21/51 — dry-run validate-against-my-cart, no persistence. */
export async function previewCoupon(code: string): Promise<CouponPreview> {
  const { data } = await httpClient.post<ApiResponse<CouponPreview>>('/coupons/validate', { code });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface CouponAnalytics {
  coupon: Coupon;
  usageCount: number;
  usageLimitGlobal: number | null;
  remainingGlobal: number | null;
  orderCount: number;
  totalDiscountGiven: number;
  totalOrderValue: number;
  orders: Record<string, unknown>[];
}

export async function getCouponAnalytics(id: string): Promise<CouponAnalytics> {
  const { data } = await httpClient.get<ApiResponse<CouponAnalytics>>(`/coupons/${id}/analytics`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function toggleCoupon(id: string, isActive: boolean): Promise<Coupon> {
  const { data } = await httpClient.patch<ApiResponse<Coupon>>(`/coupons/${id}/toggle`, {
    isActive,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Customer-facing — coupons the logged-in user can currently apply. */
export async function listAvailableCoupons(): Promise<Coupon[]> {
  const { data } = await httpClient.get<ApiResponse<Coupon[]>>('/coupons/available');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
