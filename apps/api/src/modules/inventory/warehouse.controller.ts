import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as warehouseService from './warehouse.service';

export const listWarehousesHandler = asyncHandler(async (req, res) => {
  const result = await warehouseService.listWarehouses(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getWarehouseHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await warehouseService.getWarehouseById(req.params.id));
});

export const createWarehouseHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await warehouseService.createWarehouse(req.body, req.user!.id));
});

export const updateWarehouseHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await warehouseService.updateWarehouse(req.params.id, req.body, req.user!.id),
  );
});

export const deleteWarehouseHandler = asyncHandler(async (req: Request, res) => {
  await warehouseService.deleteWarehouse(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});

export const transferWarehouseSellerHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await warehouseService.transferWarehouseSeller(
      req.params.id,
      req.body.sellerId,
      req.body.reason,
      req.user!.id,
      req.user!.role,
    ),
  );
});

export const warehouseTransferReportHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await warehouseService.getWarehouseTransferReport(req.params.id));
});
