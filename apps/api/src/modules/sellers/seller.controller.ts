import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as sellerService from './seller.service';

function actorOf(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

export const listSellersHandler = asyncHandler(async (req, res) => {
  const result = await sellerService.listSellers(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getSellerHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await sellerService.getSellerById(req.params.id));
});

export const createSellerHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await sellerService.createSeller(req.body, actorOf(req)));
});

export const updateSellerHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await sellerService.updateSeller(req.params.id, req.body, actorOf(req)));
});

export const updateSellerStatusHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await sellerService.updateSellerStatus(req.params.id, req.body.enabled, actorOf(req)),
  );
});

export const deleteSellerHandler = asyncHandler(async (req: Request, res) => {
  await sellerService.deleteSeller(req.params.id, actorOf(req));
  return sendSuccess(res, { deleted: true });
});

export const bulkDeleteSellersHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await sellerService.bulkDeleteSellers(req.body.ids, actorOf(req)));
});

export const bulkEditSellersHandler = asyncHandler(async (req: Request, res) => {
  const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
  return sendSuccess(res, await sellerService.bulkEditSellers(ids, patch, actorOf(req)));
});

export const listSellerWarehousesHandler = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    await sellerService.listSellerWarehouses(req.params.id, req.query as unknown as ListQuery),
  );
});

export const getSellerSummaryHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await sellerService.getSellerSummary(req.params.id));
});

export const exportSellersHandler = asyncHandler(async (_req, res) => {
  const buffer = await sellerService.exportSellersToExcel();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="sellers.xlsx"');
  res.send(buffer);
});
