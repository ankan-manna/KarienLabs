import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface BundleItemInput {
  componentProductId: string;
  quantity: number;
}

export interface BundleItemDetail {
  _id: string;
  componentProductId: string;
  quantity: number;
  priceRatio: number;
  component: { name: string; sku: string; mrp: number; gstRate: number; hsnCode?: string } | null;
}

export interface Bundle {
  _id: string;
  productId: string;
  sellingPrice: number;
  isActive: boolean;
  product?: { _id: string; name: string; sku: string; mrp?: number } | null;
  /**
   * Authoritative, component-derived combo stock — MIN over components of
   * floor(componentAvailable / requiredQty), computed server-side (never a
   * manually-editable field). See bundle.service.ts's
   * `resolveProductAvailability`. `0` for an inactive bundle regardless of
   * component stock.
   */
  availableQty: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BundleDetail extends Bundle {
  items: BundleItemDetail[];
}

export interface BundleInput {
  productId: string;
  sellingPrice: number;
  isActive?: boolean;
  items: BundleItemInput[];
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export const bundleApi = {
  async list(params: ListQueryParams): Promise<{ items: Bundle[]; meta: PaginatedMeta }> {
    const { data } = await httpClient.get<ApiResponse<Bundle[]>>('/bundles', { params });
    if (!data.success) throw new Error(data.error.message);
    return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
  },
  async getById(id: string): Promise<BundleDetail> {
    const { data } = await httpClient.get<ApiResponse<BundleDetail>>(`/bundles/${id}`);
    return unwrap(data);
  },
  async create(input: BundleInput): Promise<BundleDetail> {
    const { data } = await httpClient.post<ApiResponse<BundleDetail>>('/bundles', input);
    return unwrap(data);
  },
  async update(id: string, input: Partial<BundleInput>): Promise<BundleDetail> {
    const { data } = await httpClient.patch<ApiResponse<BundleDetail>>(`/bundles/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    const { data } = await httpClient.delete<ApiResponse<{ deleted: boolean }>>(`/bundles/${id}`);
    unwrap(data);
  },
};
