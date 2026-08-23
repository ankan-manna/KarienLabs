import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  orderId: string;
  totals: { grandTotal: number };
  // for S3-backed invoices this is the private object key, NOT
  // a directly-fetchable URL; a truthy value still means "the PDF exists",
  // it's just only fetched via getInvoiceDownloadUrl below.
  pdfUrl: string | null;
  storageProvider?: 'cloudinary' | 's3';
  documentStatus?: 'generating' | 'uploading' | 'available' | 'failed' | 'retrying' | 'expired';
  status: string;
  createdAt: string;
}

export async function listMyInvoices(): Promise<Invoice[]> {
  const { data } = await httpClient.get<ApiResponse<Invoice[]>>('/invoices/me');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Part 9 — the only path that returns an actually-fetchable link (short-lived presigned URL when S3-backed). */
export async function getInvoiceDownloadUrl(
  orderId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const { data } = await httpClient.get<ApiResponse<{ url: string; expiresInSeconds: number }>>(
    `/invoices/order/${orderId}/download-url`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
