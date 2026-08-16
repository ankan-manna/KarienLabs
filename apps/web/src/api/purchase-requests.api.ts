import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface PurchaseRequestItem {
  productId: string;
  quantity: number;
  estimatedUnitCost?: number | null;
  notes?: string;
}

export interface PurchaseRequest {
  _id: string;
  requestNumber: string;
  requestedBy: string;
  warehouseId: string;
  items: PurchaseRequestItem[];
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  approvedBy: string | null;
  rejectionReason: string;
  purchaseOrderId: string | null;
  notes: string;
  createdAt: string;
}

export interface CreatePurchaseRequestInput {
  warehouseId: string;
  items: {
    productId: string;
    quantity: number;
    estimatedUnitCost?: number;
    notes?: string;
  }[];
  notes?: string;
}

export interface ConvertPurchaseRequestInput {
  supplierId: string;
  items: {
    productId: string;
    variantId?: string | null;
    quantityOrdered: number;
    unitCost: number;
  }[];
  expectedDeliveryDate?: string;
  notes?: string;
}

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const { data } = await httpClient.post<ApiResponse<PurchaseRequest>>(
    '/purchase-requests',
    input,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function listPurchaseRequests(
  params: ListQueryParams = {},
): Promise<{ items: PurchaseRequest[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PurchaseRequest[]>>('/purchase-requests', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await httpClient.get<ApiResponse<PurchaseRequest>>(
    `/purchase-requests/${id}`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function approvePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { data } = await httpClient.post<ApiResponse<PurchaseRequest>>(
    `/purchase-requests/${id}/approve`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function rejectPurchaseRequest(id: string, reason: string): Promise<PurchaseRequest> {
  const { data } = await httpClient.post<ApiResponse<PurchaseRequest>>(
    `/purchase-requests/${id}/reject`,
    { reason },
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function convertPurchaseRequest(
  id: string,
  input: ConvertPurchaseRequestInput,
): Promise<PurchaseRequest> {
  const { data } = await httpClient.post<ApiResponse<PurchaseRequest>>(
    `/purchase-requests/${id}/convert`,
    input,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
