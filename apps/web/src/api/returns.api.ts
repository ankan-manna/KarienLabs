import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export type QcResult = 'sellable' | 'damaged' | 'expired' | 'tampered';
export type ReturnResolutionType = 'refund' | 'replacement';

export interface ReturnItem {
  orderItemId: string;
  quantity: number;
  reason: string;
  description?: string;
  evidenceUrls?: string[];
  requestedResolution?: ReturnResolutionType;
  productId?: string;
  name?: string;
  sku?: string;
  unitPrice?: number;
  gstRate?: number;
  batchId?: string | null;
  qcResult?: QcResult | null;
  restocked?: boolean;
  inspectionNotes?: string;
}

export interface ReverseShipment {
  shiprocketOrderId?: string | null;
  shiprocketShipmentId?: string | null;
  awbCode?: string;
  courierName?: string;
  status?: string;
  labelUrl?: string;
  storageProvider?: 'cloudinary' | 's3';
  documentStatus?: 'generating' | 'uploading' | 'available' | 'failed' | 'retrying' | 'expired';
  lastError?: string;
}

export interface ReturnRequest {
  _id: string;
  returnNumber?: string | null;
  orderId: string;
  customerId: string;
  sellerId?: string | null;
  warehouseId?: string | null;
  items: ReturnItem[];
  status:
    | 'requested'
    | 'approved'
    | 'rejected'
    | 'picked_up'
    | 'received'
    | 'inspected'
    | 'refunded'
    | 'replaced';
  rejectionReason?: string;
  refundId: string | null;
  replacementOrderId?: string | null;
  resolutionType?: ReturnResolutionType | null;
  reverseShipment?: ReverseShipment;
  receivedAt?: string | null;
  inspectedAt?: string | null;
  createdAt: string;
}

export interface RequestReturnInput {
  orderId: string;
  items: {
    orderItemId: string;
    quantity: number;
    reason: string;
    description?: string;
    evidenceUrls?: string[];
    requestedResolution?: ReturnResolutionType;
  }[];
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function requestReturn(input: RequestReturnInput): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>('/returns', input);
  return unwrap(data);
}

export async function listMyReturns(
  params: ListQueryParams = {},
): Promise<{ items: ReturnRequest[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<ReturnRequest[]>>('/returns/mine', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getReturn(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.get<ApiResponse<ReturnRequest>>(`/returns/${id}`);
  return unwrap(data);
}

// --- Admin/staff return workflow ---
// requested -> approved/rejected -> [reverse shipment] -> picked_up ->
// received -> inspected -> refunded | replaced

export async function listReturns(
  params: ListQueryParams = {},
): Promise<{ items: ReturnRequest[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<ReturnRequest[]>>('/returns', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function approveReturn(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/approve`);
  return unwrap(data);
}

export async function rejectReturn(id: string, reason: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/reject`, {
    reason,
  });
  return unwrap(data);
}

export async function markReturnPickedUp(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/picked-up`);
  return unwrap(data);
}

export async function receiveReturn(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/receive`);
  return unwrap(data);
}

export async function inspectReturn(
  id: string,
  items: { orderItemId: string; qcResult: QcResult; notes?: string }[],
): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/inspect`, {
    items,
  });
  return unwrap(data);
}

export async function resolveReturnRefund(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/resolve/refund`);
  return unwrap(data);
}

export async function resolveReturnReplacement(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(
    `/returns/${id}/resolve/replacement`,
  );
  return unwrap(data);
}

export async function createReturnReverseShipment(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(`/returns/${id}/reverse-shipment`);
  return unwrap(data);
}

export async function downloadReturnLabel(id: string): Promise<{ labelUrl: string }> {
  const { data } = await httpClient.get<ApiResponse<{ labelUrl: string }>>(
    `/returns/${id}/reverse-shipment/label`,
  );
  return unwrap(data);
}

export async function syncReturnTracking(id: string): Promise<ReturnRequest> {
  const { data } = await httpClient.post<ApiResponse<ReturnRequest>>(
    `/returns/${id}/reverse-shipment/sync-tracking`,
  );
  return unwrap(data);
}
