import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as stockAdjustmentService from './stock-adjustment.service';

export const listStockAdjustmentsHandler = asyncHandler(async (req, res) => {
  const result = await stockAdjustmentService.listStockAdjustments(
    req.query as unknown as ListQuery,
  );
  return sendPaginated(res, result.items, result.meta);
});

export const getStockAdjustmentHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await stockAdjustmentService.getStockAdjustmentById(req.params.id));
});

export const requestStockAdjustmentHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(
    res,
    await stockAdjustmentService.requestStockAdjustment(req.body, req.user!.id),
  );
});

export const quickAddStockHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await stockAdjustmentService.quickAddStock(req.body, req.user!.id));
});

export const approveStockAdjustmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await stockAdjustmentService.approveStockAdjustment(req.params.id, req.user!.id),
  );
});

export const rejectStockAdjustmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await stockAdjustmentService.rejectStockAdjustment(req.params.id, req.user!.id),
  );
});
