import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { resolveDocumentDownloadUrl } from '../documents/document-storage.helper';
import { ensureInvoicePdfAvailable } from '../invoices/invoice.service';
import { InvoiceModel } from '../invoices/models/invoice.model';

/**
 * Admin-facing view across all customers' invoices — distinct from the customer's
 * own `/invoices/me` self-service listing. Supports `filter[status]`,
 * `filter[customerId]`, and `filter[dateFrom]`/`filter[dateTo]` (createdAt range).
 */
export function listInvoicesAdmin(query: ListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const { dateFrom, dateTo, ...rest } = query.filter ?? {};
  const filter: Record<string, unknown> = { ...rest };

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    filter.createdAt = createdAt;
  }

  return Promise.all([
    InvoiceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    InvoiceModel.countDocuments(filter),
  ]).then(([items, total]) => ({
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }));
}

/** Admin equivalent of invoice.service.ts's getInvoiceDownloadUrl — no customerId ownership filter (RBAC on the route already gates this to permitted admin roles), same short-lived-presigned-when-S3-backed resolution. */
export async function getInvoiceDownloadUrlAdmin(
  id: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const invoice = await InvoiceModel.findById(id);
  if (!invoice) throw new NotFoundError('Invoice');
  // Part 12/38 — same transparent expired-object recovery the customer
  // download path uses (invoice.service.ts), reused rather than duplicated.
  await ensureInvoicePdfAvailable(invoice);

  const expiresInSeconds = 300;
  const url = await resolveDocumentDownloadUrl(invoice.storageProvider, invoice.pdfUrl, expiresInSeconds);
  if (!url) throw new UnprocessableEntityError('Invoice PDF is not ready yet');
  return { url, expiresInSeconds };
}
