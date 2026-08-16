import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';

export interface GstSetting {
  _id: string;
  hsnCode: string;
  description: string;
  gstRate: number;
  cessRate: number;
  isActive: boolean;
}

export const gstSettingApi = createCrudApi<GstSetting>('/tax/gst-settings');

export interface ProductTaxMapping {
  _id: string;
  productId: string;
  hsnCode: string;
  gstRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function listProductTaxMappings(productId?: string): Promise<ProductTaxMapping[]> {
  const { data } = await httpClient.get<ApiResponse<ProductTaxMapping[]>>(
    '/tax/product-tax-mappings',
    { params: productId ? { productId } : {} },
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function createProductTaxMapping(input: {
  productId: string;
  hsnCode: string;
  gstRate: number;
  effectiveFrom?: string;
}): Promise<ProductTaxMapping> {
  const { data } = await httpClient.post<ApiResponse<ProductTaxMapping>>(
    '/tax/product-tax-mappings',
    input,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
