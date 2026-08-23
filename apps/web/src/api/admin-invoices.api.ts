import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface InvoiceComponentLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceShare: number;
  gstRate: number;
  hsnCode: string;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
}

export interface InvoiceLine {
  name: string;
  sku?: string;
  batchNumber: string;
  batchId: string | null;
  hsnCode: string;
  mrp: number | null;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  bundleComponents?: InvoiceComponentLine[];
}

export interface AdminInvoice {
  _id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  sellerId: string | null;
  sellerNameSnapshot: string;
  sellerGstinSnapshot: string;
  sellerAddressSnapshot: string;
  sellerDrugLicenseSnapshot: string;
  warehouseId: string | null;
  warehouseNameSnapshot: string;
  warehouseGstinSnapshot: string;
  warehouseStateCodeSnapshot: string;
  customerShippingStateSnapshot: string;
  taxType: 'intra_state' | 'inter_state' | 'unknown';
  items: InvoiceLine[];
  gstBreakup: { cgst: number; sgst: number; igst: number };
  totals: { subtotal: number; gst: number; shipping: number; discount: number; grandTotal: number };
  roundOffAmount: number;
  finalAmount: number;
  invoiceDate: string | null;
  status: string;
  // for S3-backed invoices this is the private object key, not
  // a directly-fetchable URL. Use fetchAdminInvoiceDownloadUrl for a real link.
  pdfUrl: string | null;
  storageProvider?: 'cloudinary' | 's3';
  documentStatus?: 'generating' | 'uploading' | 'available' | 'failed' | 'retrying' | 'expired';
  createdAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function fetchAdminInvoices(
  params: ListQueryParams,
): Promise<{ items: AdminInvoice[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<AdminInvoice[]>>('/admin/invoices', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function regenerateInvoiceForOrder(orderId: string): Promise<AdminInvoice> {
  const { data } = await httpClient.post<ApiResponse<AdminInvoice>>(`/invoices/${orderId}/regenerate`);
  return unwrap(data);
}

/** Part 9/26 — admin document-download action; returns a short-lived presigned URL for S3-backed invoices. */
export async function fetchAdminInvoiceDownloadUrl(
  id: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const { data } = await httpClient.get<ApiResponse<{ url: string; expiresInSeconds: number }>>(
    `/admin/invoices/${id}/download-url`,
  );
  return unwrap(data);
}
