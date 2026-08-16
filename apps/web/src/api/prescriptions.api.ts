import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';
import { uploadImageDirect } from './uploads.api';

export type PrescriptionStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface Prescription {
  _id: string;
  userId: string;
  orderId: string | null;
  orderItemIds?: string[];
  cloudinaryPublicId?: string | null;
  storageProvider?: 'cloudinary' | 's3' | null;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  status: PrescriptionStatus;
  rejectionReason: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  expiryDate?: string | null;
  revisionNumber?: number;
  previousVersionId?: string | null;
  createdAt: string;
  signedUrl?: string;
}

export interface PrescriptionConfig {
  managementEnabled: boolean;
  uploadEnabled: boolean;
  verificationEnabled: boolean;
  reuseEnabled: boolean;
  orderBlockingEnabled: boolean;
  checkoutUploadRequired: boolean;
  validityEnabled: boolean;
  validityDays: number;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

// --- Configuration (Super Admin / permitted Platform Admin) ---

export async function getPrescriptionConfig(): Promise<PrescriptionConfig> {
  const { data } = await httpClient.get<ApiResponse<PrescriptionConfig>>('/prescriptions/config');
  return unwrap(data);
}

export async function setPrescriptionConfig(
  partial: Partial<PrescriptionConfig>,
): Promise<PrescriptionConfig> {
  const { data } = await httpClient.put<ApiResponse<PrescriptionConfig>>('/prescriptions/config', partial);
  return unwrap(data);
}

// --- Customer ---

export async function listMyPrescriptions(): Promise<Prescription[]> {
  const { data } = await httpClient.get<ApiResponse<Prescription[]>>('/prescriptions/me');
  return unwrap(data);
}

export async function listReusablePrescriptions(): Promise<Prescription[]> {
  const { data } = await httpClient.get<ApiResponse<Prescription[]>>('/prescriptions/reusable');
  return unwrap(data);
}

export async function getPrescription(id: string): Promise<Prescription> {
  const { data } = await httpClient.get<ApiResponse<Prescription>>(`/prescriptions/${id}`);
  return unwrap(data);
}

interface ConfirmUploadPayload {
  cloudinaryPublicId?: string;
  prescriptionId?: string;
  objectKey?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  orderId?: string | null;
  orderItemIds?: string[];
}

async function confirmPrescriptionUploadRaw(payload: ConfirmUploadPayload): Promise<Prescription> {
  const { data } = await httpClient.post<ApiResponse<Prescription>>('/prescriptions', payload);
  return unwrap(data);
}

/**
 * Part 10/54 — tries the new private-S3 direct-upload flow first (a
 * presigned PUT URL, file bytes go straight to S3, never through the API);
 * transparently falls back to the pre-existing Cloudinary signed-upload
 * flow when S3 isn't configured, so this single function is the only thing
 * callers (PrescriptionsPage, checkout) need to use.
 */
export async function uploadPrescription(
  file: File,
  options: { orderId?: string; orderItemIds?: string[] } = {},
): Promise<Prescription> {
  const { data: uploadUrlResponse } = await httpClient.post<
    ApiResponse<{ s3Configured: boolean; prescriptionId?: string; objectKey?: string; uploadUrl?: string }>
  >('/prescriptions/upload-url', { fileName: file.name, mimeType: file.type, fileSize: file.size });
  const uploadUrlData = unwrap(uploadUrlResponse);

  if (uploadUrlData.s3Configured && uploadUrlData.uploadUrl) {
    const putResponse = await fetch(uploadUrlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!putResponse.ok) throw new Error('Prescription upload failed');

    return confirmPrescriptionUploadRaw({
      prescriptionId: uploadUrlData.prescriptionId,
      objectKey: uploadUrlData.objectKey,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      orderId: options.orderId,
      orderItemIds: options.orderItemIds,
    });
  }

  // Legacy Cloudinary fallback — unchanged behavior.
  const asset = await uploadImageDirect(file, 'prescription_secure', 'prescriptions');
  return confirmPrescriptionUploadRaw({
    cloudinaryPublicId: asset.publicId,
    orderId: options.orderId,
    orderItemIds: options.orderItemIds,
  });
}

export async function reuploadPrescription(
  id: string,
  file: File,
  options: { orderId?: string; orderItemIds?: string[] } = {},
): Promise<Prescription> {
  // Re-upload reuses the same upload-url negotiation, then confirms against the /reupload endpoint.
  const { data: uploadUrlResponse } = await httpClient.post<
    ApiResponse<{ s3Configured: boolean; prescriptionId?: string; objectKey?: string; uploadUrl?: string }>
  >('/prescriptions/upload-url', { fileName: file.name, mimeType: file.type, fileSize: file.size });
  const uploadUrlData = unwrap(uploadUrlResponse);

  let payload: ConfirmUploadPayload;
  if (uploadUrlData.s3Configured && uploadUrlData.uploadUrl) {
    const putResponse = await fetch(uploadUrlData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!putResponse.ok) throw new Error('Prescription upload failed');
    payload = {
      prescriptionId: uploadUrlData.prescriptionId,
      objectKey: uploadUrlData.objectKey,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      orderId: options.orderId,
      orderItemIds: options.orderItemIds,
    };
  } else {
    const asset = await uploadImageDirect(file, 'prescription_secure', 'prescriptions');
    payload = { cloudinaryPublicId: asset.publicId, orderId: options.orderId, orderItemIds: options.orderItemIds };
  }

  const { data } = await httpClient.post<ApiResponse<Prescription>>(`/prescriptions/${id}/reupload`, payload);
  return unwrap(data);
}

export async function cancelPrescription(id: string): Promise<Prescription> {
  const { data } = await httpClient.post<ApiResponse<Prescription>>(`/prescriptions/${id}/cancel`);
  return unwrap(data);
}

// --- Admin review ---

export async function listPrescriptionsAdmin(
  params: ListQueryParams = {},
): Promise<{ items: Prescription[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Prescription[]>>('/prescriptions', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function approvePrescription(id: string): Promise<Prescription> {
  const { data } = await httpClient.post<ApiResponse<Prescription>>(`/prescriptions/${id}/approve`);
  return unwrap(data);
}

export async function rejectPrescription(id: string, rejectionReason: string): Promise<Prescription> {
  const { data } = await httpClient.post<ApiResponse<Prescription>>(`/prescriptions/${id}/reject`, {
    rejectionReason,
  });
  return unwrap(data);
}

// --- Legacy alias (kept so any other existing call site keeps compiling) ---
export const confirmPrescriptionUpload = (cloudinaryPublicId: string) =>
  confirmPrescriptionUploadRaw({ cloudinaryPublicId });
