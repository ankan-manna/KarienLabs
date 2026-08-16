import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export type DistributorEnquiryStatus =
  | 'new'
  | 'in_review'
  | 'contacted'
  | 'negotiating'
  | 'quoted'
  | 'converted'
  | 'closed'
  | 'rejected';

export interface DistributorEnquiryRequestedProduct {
  productId: string | null;
  bundleId: string | null;
  nameSnapshot: string;
  skuSnapshot: string;
  requestedQuantity: number;
}

export interface DistributorEnquiryInternalNote {
  authorId: string;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface DistributorEnquiryListItem {
  _id: string;
  enquiryNumber: string;
  userId: string | null;
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  gstin: string | null;
  city: string;
  state: string;
  status: DistributorEnquiryStatus;
  assignedAdminId: string | null;
  requestedProducts: DistributorEnquiryRequestedProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface DistributorEnquiryDetail extends DistributorEnquiryListItem {
  businessAddress: string;
  pincode: string;
  message: string;
  contactVerified: boolean;
  internalNotes: DistributorEnquiryInternalNote[];
  contactedAt: string | null;
  resolvedAt: string | null;
}

export interface AssignableStaff {
  _id: string;
  name: string;
  email: string;
  role: string;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function listDistributorEnquiriesAdmin(
  params: ListQueryParams,
): Promise<{ items: DistributorEnquiryListItem[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<DistributorEnquiryListItem[]>>(
    '/admin/distributor-enquiries',
    { params },
  );
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getDistributorEnquiryAdmin(id: string): Promise<DistributorEnquiryDetail> {
  const { data } = await httpClient.get<ApiResponse<DistributorEnquiryDetail>>(
    `/admin/distributor-enquiries/${id}`,
  );
  return unwrap(data);
}

export async function updateDistributorEnquiryStatus(
  id: string,
  status: DistributorEnquiryStatus,
): Promise<DistributorEnquiryDetail> {
  const { data } = await httpClient.patch<ApiResponse<DistributorEnquiryDetail>>(
    `/admin/distributor-enquiries/${id}/status`,
    { status },
  );
  return unwrap(data);
}

export async function assignDistributorEnquiry(
  id: string,
  adminUserId: string,
): Promise<DistributorEnquiryDetail> {
  const { data } = await httpClient.patch<ApiResponse<DistributorEnquiryDetail>>(
    `/admin/distributor-enquiries/${id}/assignment`,
    { adminUserId },
  );
  return unwrap(data);
}

export async function addDistributorEnquiryNote(
  id: string,
  note: string,
): Promise<DistributorEnquiryDetail> {
  const { data } = await httpClient.post<ApiResponse<DistributorEnquiryDetail>>(
    `/admin/distributor-enquiries/${id}/notes`,
    { note },
  );
  return unwrap(data);
}

export async function listAssignableStaff(): Promise<AssignableStaff[]> {
  const { data } = await httpClient.get<ApiResponse<AssignableStaff[]>>(
    '/admin/distributor-enquiries/assignable-staff',
  );
  return unwrap(data);
}
