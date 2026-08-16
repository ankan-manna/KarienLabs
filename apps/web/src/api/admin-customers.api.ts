import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface CustomerListItem {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

export interface CustomerDetail {
  user: CustomerListItem;
  profile: Record<string, unknown> | null;
  addresses: Record<string, unknown>[];
  wishlistItemCount: number;
  prescriptions: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  orderCount: number;
  totalSpent: number;
  activity: Record<string, unknown>[];
}

export async function listCustomers(
  params: ListQueryParams,
): Promise<{ items: CustomerListItem[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<CustomerListItem[]>>('/admin/customers', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail> {
  const { data } = await httpClient.get<ApiResponse<CustomerDetail>>(`/admin/customers/${id}`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function setCustomerStatus(id: string, isActive: boolean): Promise<CustomerListItem> {
  const { data } = await httpClient.patch<ApiResponse<CustomerListItem>>(
    `/admin/customers/${id}/status`,
    { isActive },
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
