import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface MyOrder {
  _id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totals: { grandTotal: number; discount: number };
  couponCode: string | null;
  createdAt: string;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function listMyOrders(): Promise<MyOrder[]> {
  const { data } = await httpClient.get<ApiResponse<MyOrder[]>>('/orders/me');
  return unwrap(data);
}

export async function getMyOrder(id: string) {
  const { data } = await httpClient.get<ApiResponse<MyOrder>>(`/orders/${id}`);
  return unwrap(data);
}

export interface CheckoutIntentResult {
  razorpayOrder: { id: string; amount: number; currency: string };
  payment: { _id: string; amount: number; currency: string };
  /** Razorpay's public key_id — safe to embed client-side, unlike key_secret. */
  keyId: string;
}

/**
 * Prompt 2 (prepaid-only redesign) — checkout Phase 1. Validates the cart/
 * address/coupon/combo/GST/shipping rules server-side and creates a Razorpay
 * order for the authoritative amount. Deliberately does NOT create an Order
 * and does NOT touch inventory or the cart — replaces the old two-step
 * `checkout()` + `createPaymentOrder()` (which used to create a real,
 * unpaid Order before any payment happened).
 */
export async function createCheckoutIntent(input: {
  addressId: string;
  couponCode?: string;
  deliveryType?: 'standard' | 'express';
}): Promise<CheckoutIntentResult> {
  const { data } = await httpClient.post<ApiResponse<CheckoutIntentResult>>(
    '/payments/checkout-intent',
    input,
  );
  return unwrap(data);
}

export interface VerifyPaymentResult {
  verified: true;
  /** `confirmed` = the order now exists and is authoritative. `processing` = payment WAS captured but order finalization is still being resolved (Part 24) — never treat this as a failure. */
  status: 'confirmed' | 'processing';
  orderId: string | null;
  orderNumber: string | null;
}

export async function verifyPayment(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<VerifyPaymentResult> {
  const { data } = await httpClient.post<ApiResponse<VerifyPaymentResult>>(
    '/payments/razorpay/verify',
    input,
  );
  return unwrap(data);
}

// --- Fulfillment automation configuration (Super Admin / permitted Platform Admin) ---

export interface FulfillmentConfig {
  automationEnabled: boolean;
  orderAdvancementEnabled: boolean;
  shippingAutomationEnabled: boolean;
  labelAutomationEnabled: boolean;
  cronIntervalHours: number;
  toleranceMinutes: number;
  batchSize: number;
}

export async function getFulfillmentConfig(): Promise<FulfillmentConfig> {
  const { data } = await httpClient.get<ApiResponse<FulfillmentConfig>>('/orders/fulfillment-config');
  return unwrap(data);
}

export async function setFulfillmentConfig(
  partial: Partial<FulfillmentConfig>,
): Promise<FulfillmentConfig> {
  const { data } = await httpClient.put<ApiResponse<FulfillmentConfig>>(
    '/orders/fulfillment-config',
    partial,
  );
  return unwrap(data);
}
