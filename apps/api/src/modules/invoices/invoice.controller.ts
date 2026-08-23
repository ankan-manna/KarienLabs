import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as invoiceService from './invoice.service';

export const listMyInvoicesHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await invoiceService.listMyInvoices(req.user!.id));
});

export const getInvoiceByOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await invoiceService.getInvoiceByOrderId(req.params.orderId, req.user!.id),
  );
});

export const emailInvoiceHandler = asyncHandler(async (req: Request, res) => {
  await invoiceService.sendInvoiceEmail(req.params.orderId, req.user!.id);
  return sendSuccess(res, { queued: true });
});

export const regenerateInvoiceHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await invoiceService.regenerateInvoice(req.params.orderId, req.user!.id, req.user!.role),
  );
});

/** Part 9 — the only path a customer gets an actual (short-lived, presigned when S3-backed) download link from; ownership is enforced by getInvoiceDownloadUrl -> getInvoiceByOrderId's customerId filter. */
export const getInvoiceDownloadUrlHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await invoiceService.getInvoiceDownloadUrl(req.params.orderId, req.user!.id));
});
