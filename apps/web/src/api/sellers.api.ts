import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';
import type { PaginatedMeta } from './types';

/**
 * A Seller is a legal/business entity that sells on the platform — distinct
 * from Supplier (see Supplier in inventory.api.ts) and from a platform Admin
 * user. See apps/api/src/modules/sellers/models/seller.model.ts.
 */
export interface Seller {
  _id: string;
  legalName: string;
  gstin: string;
  drugLicenseNumber: string;
  enabled: boolean;
  // Prompt 13 — invoice display/numbering.
  address?: string;
  invoiceCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export const sellerApi = {
  ...createCrudApi<Seller>('/sellers'),
  async updateStatus(id: string, enabled: boolean): Promise<Seller> {
    const { data } = await httpClient.patch<ApiResponse<Seller>>(`/sellers/${id}/status`, {
      enabled,
    });
    if (!data.success) throw new Error(data.error.message);
    return data.data;
  },
};

export interface SellerSummary {
  warehouseCount: number;
  orders: { count: number; totalValue: number };
  invoices: { count: number; totalValue: number };
  inventory: { batchCount: number; totalUnits: number };
}

export async function fetchSellerSummary(id: string): Promise<SellerSummary> {
  const { data } = await httpClient.get<ApiResponse<SellerSummary>>(`/sellers/${id}/summary`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function fetchSellerWarehouses(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ items: unknown[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<unknown[]>>(`/sellers/${id}/warehouses`, {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}
