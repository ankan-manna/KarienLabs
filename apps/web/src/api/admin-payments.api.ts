import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface PaymentListItem {
  _id: string;
  /** `null` for a payment whose checkout was never completed/paid (Prompt 2 prepaid-only redesign) — no Order was ever created for it. */
  orderId: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amount: number;
  currency: string;
  method: string;
  status: 'pending' | 'captured' | 'failed' | 'refunded';
  failureReason: string;
  /** Part 24 — non-null means payment WAS captured at Razorpay but order finalization hasn't succeeded yet (inventory/coupon race, transient error). Needs manual review; the money is not lost. */
  reconciliationError: string | null;
  createdAt: string;
}

export async function listPayments(
  params: ListQueryParams,
): Promise<{ items: PaymentListItem[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PaymentListItem[]>>('/admin/payments', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function listFailedPayments(
  params: ListQueryParams,
): Promise<{ items: PaymentListItem[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PaymentListItem[]>>(
    '/admin/payments/failed',
    { params },
  );
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getPaymentDetail(
  id: string,
): Promise<{ payment: PaymentListItem; order: Record<string, unknown> | null }> {
  const { data } =
    await httpClient.get<ApiResponse<{ payment: PaymentListItem; order: Record<string, unknown> | null }>>(
      `/admin/payments/${id}`,
    );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function issueRefund(
  id: string,
  input: { amountInPaise?: number; reason?: string },
): Promise<PaymentListItem> {
  const { data } = await httpClient.post<ApiResponse<PaymentListItem>>(
    `/admin/payments/${id}/refund`,
    input,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
