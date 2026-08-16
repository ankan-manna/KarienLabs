import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as purchaseRequestService from './purchase-request.service';

export const listPurchaseRequestsHandler = asyncHandler(async (req, res) => {
  const result = await purchaseRequestService.listPurchaseRequests(
    req.query as unknown as ListQuery,
  );
  return sendPaginated(res, result.items, result.meta);
});

export const getPurchaseRequestHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await purchaseRequestService.getPurchaseRequestById(req.params.id));
});

export const createPurchaseRequestHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(
    res,
    await purchaseRequestService.createPurchaseRequest(req.body, req.user!.id),
  );
});

export const approvePurchaseRequestHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await purchaseRequestService.approvePurchaseRequest(req.params.id, req.user!.id),
  );
});

export const rejectPurchaseRequestHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await purchaseRequestService.rejectPurchaseRequest(
      req.params.id,
      req.user!.id,
      req.body.reason,
    ),
  );
});

export const convertPurchaseRequestHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await purchaseRequestService.convertToPurchaseOrder(req.params.id, req.user!.id, req.body),
  );
});
