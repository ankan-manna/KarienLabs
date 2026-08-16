import type { Request } from 'express';

import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as batchService from './batch.service';

export const listBatchesHandler = asyncHandler(async (req, res) => {
  const result = await batchService.listBatches(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getBatchHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await batchService.getBatchById(req.params.id));
});

export const updateBatchStatusHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await batchService.updateBatchStatus(req.params.id, req.body.status, req.user!.id),
  );
});

export const updateBatchMrpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await batchService.updateBatchMrp(req.params.id, req.body.mrp, {
      id: req.user!.id,
      role: req.user!.role,
    }),
  );
});

export const updateBatchRecallHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await batchService.setBatchRecallFlag(
      req.params.id,
      req.body.recallFlag,
      { id: req.user!.id, role: req.user!.role },
      req.body.reason,
    ),
  );
});

export const lowStockReportHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await batchService.getLowStockReport());
});

export const nearExpiryReportHandler = asyncHandler(async (req, res) => {
  const withinDays = Number(req.query.days ?? 30);
  return sendSuccess(res, await batchService.getNearExpiryReport(withinDays));
});
