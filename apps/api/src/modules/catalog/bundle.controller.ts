import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as bundleService from './bundle.service';

function actorOf(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

export const listBundlesHandler = asyncHandler(async (req, res) => {
  const result = await bundleService.listBundles(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getBundleHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await bundleService.getBundleById(req.params.id));
});

export const createBundleHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await bundleService.createBundle(req.body, actorOf(req)));
});

export const updateBundleHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await bundleService.updateBundle(req.params.id, req.body, actorOf(req)));
});

export const deleteBundleHandler = asyncHandler(async (req: Request, res) => {
  await bundleService.deleteBundle(req.params.id, actorOf(req));
  return sendSuccess(res, { deleted: true });
});
