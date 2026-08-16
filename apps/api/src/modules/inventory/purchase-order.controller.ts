import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as purchaseOrderService from './purchase-order.service';

export const listPurchaseOrdersHandler = asyncHandler(async (req, res) => {
  const result = await purchaseOrderService.listPurchaseOrders(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getPurchaseOrderHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await purchaseOrderService.getPurchaseOrderById(req.params.id));
});

export const createPurchaseOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await purchaseOrderService.createPurchaseOrder(req.body, req.user!.id));
});

export const sendPurchaseOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await purchaseOrderService.sendPurchaseOrder(req.params.id, req.user!.id),
  );
});

export const cancelPurchaseOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await purchaseOrderService.cancelPurchaseOrder(req.params.id, req.user!.id),
  );
});
