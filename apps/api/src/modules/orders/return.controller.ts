import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import {
  createReverseShipmentForReturn,
  fetchAndStoreReturnLabel,
  syncReturnShipmentTracking,
} from './return-shiprocket.service';
import * as returnService from './return.service';

export const requestReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await returnService.requestReturn(req.body, req.user!.id));
});

export const listMyReturnsHandler = asyncHandler(async (req: Request, res) => {
  const result = await returnService.listMyReturns(req.user!.id, req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const listReturnsHandler = asyncHandler(async (req: Request, res) => {
  const result = await returnService.listReturns(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await returnService.getReturnById(req.params.id, req.user!));
});

export const approveReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.approveReturn(req.params.id, req.user!.id, req.user!.role),
  );
});

export const rejectReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.rejectReturn(req.params.id, req.user!.id, req.body.reason, req.user!.role),
  );
});

export const markPickedUpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.markPickedUp(req.params.id, req.user!.id, req.user!.role),
  );
});

export const receiveReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.receiveReturn(req.params.id, req.user!.id, req.user!.role),
  );
});

export const inspectReturnHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.inspectReturn(req.params.id, req.body.items, req.user!.id, req.user!.role),
  );
});

export const resolveReturnRefundHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.resolveReturnRefund(req.params.id, req.user!.id, req.user!.role),
  );
});

export const resolveReturnReplacementHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await returnService.resolveReturnReplacement(req.params.id, req.user!.id, req.user!.role),
  );
});

export const createReverseShipmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await createReverseShipmentForReturn(req.params.id, { id: req.user!.id, role: req.user!.role }),
  );
});

export const downloadReturnLabelHandler = asyncHandler(async (req: Request, res) => {
  const ret = await fetchAndStoreReturnLabel(req.params.id, { id: req.user!.id, role: req.user!.role });
  const { resolveDocumentDownloadUrl } = await import('../documents/document-storage.helper');
  const labelUrl = await resolveDocumentDownloadUrl(
    ret.reverseShipment?.storageProvider,
    ret.reverseShipment?.labelUrl,
  );
  return sendSuccess(res, { labelUrl });
});

export const syncReturnTrackingHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await syncReturnShipmentTracking(req.params.id, { id: req.user!.id, role: req.user!.role }),
  );
});
