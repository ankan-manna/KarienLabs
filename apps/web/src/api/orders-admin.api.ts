import type { ApiResponse, OrderStatus } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface OrderItem {
  _id: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  note: string;
  changedAt: string;
}

export interface AdminOrder {
  _id: string;
  orderNumber: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentStatus: string;
  statusHistory: OrderStatusEvent[];
  totals: { subtotal: number; gst: number; shipping: number; discount: number; grandTotal: number };
  createdAt: string;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

// --- Prompt 21 Part 10 — the enriched customer order-detail shape. `GET
// /orders/:id` returns this composed response when the caller is a
// customer (see order.controller.ts's getOrderHandler branch) — the SAME
// endpoint `getOrder` below calls, just richer for that role, so no new
// route was needed. ---

export interface OrderDetailShipmentSummary {
  _id: string;
  status: string;
  awbCode?: string;
  courierName?: string;
  trackingEvents: { status: string; location?: string; timestamp: string }[];
  estimatedDeliveryDate: string | null;
  createdAt: string;
}

export interface OrderDetailReturnSummary {
  _id: string;
  returnNumber: string | null;
  status: string;
  resolutionType: string | null;
  items: { orderItemId: string; name?: string; quantity: number; reason: string }[];
  rejectionReason?: string;
  reverseShipment?: { awbCode?: string; status?: string };
  createdAt: string;
}

export interface OrderDetailRefundSummary {
  _id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface MyOrderDetail extends AdminOrder {
  invoice: { invoiceNumber: string; status: string; available: boolean } | null;
  returns: OrderDetailReturnSummary[];
  refunds: OrderDetailRefundSummary[];
  replacementOrder: { orderNumber: string; status: string; createdAt: string } | null;
  shipments: OrderDetailShipmentSummary[];
  returnEligible: boolean;
}

export async function getMyOrderDetail(id: string): Promise<MyOrderDetail> {
  const { data } = await httpClient.get<ApiResponse<MyOrderDetail>>(`/orders/${id}`);
  return unwrap(data);
}

export async function listOrders(
  params: ListQueryParams,
): Promise<{ items: AdminOrder[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<AdminOrder[]>>('/orders', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getOrder(id: string): Promise<AdminOrder> {
  const { data } = await httpClient.get<ApiResponse<AdminOrder>>(`/orders/${id}`);
  return unwrap(data);
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<AdminOrder> {
  const { data } = await httpClient.patch<ApiResponse<AdminOrder>>(`/orders/${id}/status`, {
    status,
    note,
  });
  return unwrap(data);
}

/** Customer self-service cancel — distinct from the admin status-update endpoint above. */
export async function cancelOrder(id: string, reason: string): Promise<AdminOrder> {
  const { data } = await httpClient.post<ApiResponse<AdminOrder>>(`/orders/${id}/cancel`, {
    reason,
  });
  return unwrap(data);
}
