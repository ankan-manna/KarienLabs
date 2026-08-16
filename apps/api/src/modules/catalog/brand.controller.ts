import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as brandService from './brand.service';

export const listBrandsHandler = asyncHandler(async (req, res) => {
  const result = await brandService.listBrands(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getBrandHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await brandService.getBrandById(req.params.id));
});

export const createBrandHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await brandService.createBrand(req.body, req.user!.id));
});

export const updateBrandHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await brandService.updateBrand(req.params.id, req.body, req.user!.id));
});

export const deleteBrandHandler = asyncHandler(async (req: Request, res) => {
  await brandService.deleteBrand(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});
