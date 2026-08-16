import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as manufacturerService from './manufacturer.service';

export const listManufacturersHandler = asyncHandler(async (req, res) => {
  const result = await manufacturerService.listManufacturers(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getManufacturerHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await manufacturerService.getManufacturerById(req.params.id));
});

export const createManufacturerHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await manufacturerService.createManufacturer(req.body, req.user!.id));
});

export const updateManufacturerHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await manufacturerService.updateManufacturer(req.params.id, req.body, req.user!.id),
  );
});

export const deleteManufacturerHandler = asyncHandler(async (req: Request, res) => {
  await manufacturerService.deleteManufacturer(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});
