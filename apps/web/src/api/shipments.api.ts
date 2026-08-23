import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export type ShipmentStatus =
  | 'pending'
  | 'ready_for_dispatch'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'rto';

export interface ShipmentTrackingEvent {
  status: ShipmentStatus;
  location?: string;
  remarks?: string;
  timestamp: string;
}

export interface Shipment {
  _id: string;
  orderId: string;
  deliveryPartnerId: string;
  trackingNumber: string;
  status: ShipmentStatus;
  itemIds: string[];
  estimatedDeliveryDate: string | null;
  dispatchedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  deliveryNotes: string | null;
  trackingEvents: ShipmentTrackingEvent[];
  createdAt: string;
   // Shiprocket fulfillment fields.
  sellerId?: string | null;
  warehouseId?: string | null;
  invoiceId?: string | null;
  shiprocketOrderId?: string | null;
  shiprocketShipmentId?: string | null;
  shiprocketStatusRaw?: string;
  courierId?: string;
  courierName?: string;
  awbCode?: string;
  labelUrl?: string;
  // for S3-backed labels this is the private object key, not a
  // directly-fetchable URL; downloadShipmentLabel() below always resolves
  // an actual (presigned, when applicable) link server-side.
  storageProvider?: 'cloudinary' | 's3';
  documentStatus?: 'generating' | 'uploading' | 'available' | 'failed' | 'retrying' | 'expired';
  weightGrams?: number | null;
  dimensions?: { lengthMm: number | null; widthMm: number | null; heightMm: number | null };
  coldStorageRequired?: boolean;
  lastError?: string;
  pickupScheduledAt?: string | null;
}

export interface ServiceabilityResult {
  pincode: string;
  available: boolean;
  shippingCharge: number;
  estimatedDeliveryDate: string | null;
  couriers: { name: string; etd?: string }[];
}

export interface CreateShipmentInput {
  orderId: string;
  deliveryPartnerId: string;
  trackingNumber?: string;
  itemIds?: string[];
  estimatedDeliveryDate?: string;
}

export interface UpdateShipmentStatusInput {
  status: ShipmentStatus;
  location?: string;
  remarks?: string;
}

export interface DeliveryReport {
  byStatus: { status: string; count: number }[];
  averageDeliveryTimeByPartner: {
    deliveryPartnerId: string;
    deliveryPartnerName?: string;
    avgDeliveryTimeHours: number;
    deliveredCount: number;
  }[];
  failedOrRtoCount: number;
}

export async function listShipments(
  params: ListQueryParams = {},
): Promise<{ items: Shipment[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Shipment[]>>('/shipments', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getShipment(id: string): Promise<Shipment> {
  const { data } = await httpClient.get<ApiResponse<Shipment>>(`/shipments/${id}`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function getShipmentsByOrder(orderId: string): Promise<Shipment[]> {
  const { data } = await httpClient.get<ApiResponse<Shipment[]>>(`/shipments/order/${orderId}`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function createShipment(input: CreateShipmentInput): Promise<Shipment> {
  const { data } = await httpClient.post<ApiResponse<Shipment>>('/shipments', input);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function updateShipmentStatus(
  id: string,
  input: UpdateShipmentStatusInput,
): Promise<Shipment> {
  const { data } = await httpClient.patch<ApiResponse<Shipment>>(`/shipments/${id}/status`, input);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function addDeliveryNote(id: string, note: string): Promise<Shipment> {
  const { data } = await httpClient.patch<ApiResponse<Shipment>>(`/shipments/${id}/notes`, {
    note,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function getDeliveryReport(): Promise<DeliveryReport> {
  const { data } = await httpClient.get<ApiResponse<DeliveryReport>>('/shipments/reports/delivery');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

// ---  14: Shiprocket fulfillment actions ---

export async function createShiprocketShipment(orderId: string): Promise<Shipment> {
  const { data } = await httpClient.post<ApiResponse<Shipment>>(`/shipments/order/${orderId}/shiprocket`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function retryShipment(orderId: string): Promise<Shipment> {
  const { data } = await httpClient.post<ApiResponse<Shipment>>(`/shipments/order/${orderId}/retry`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function assignShipmentAwb(id: string): Promise<Shipment> {
  const { data } = await httpClient.post<ApiResponse<Shipment>>(`/shipments/${id}/assign-awb`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function syncShipmentTracking(id: string): Promise<Shipment> {
  const { data } = await httpClient.post<ApiResponse<Shipment>>(`/shipments/${id}/sync-tracking`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function downloadShipmentLabel(id: string): Promise<{ labelUrl: string }> {
  const { data } = await httpClient.get<ApiResponse<{ labelUrl: string }>>(`/shipments/${id}/label`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function checkServiceability(input: {
  pincode: string;
  sellerId?: string;
  subtotal?: number;
  state?: string;
  totalWeightGrams?: number;
}): Promise<ServiceabilityResult> {
  const { data } = await httpClient.post<ApiResponse<ServiceabilityResult>>(
    '/delivery/serviceability',
    input,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
