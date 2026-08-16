import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as dynamicMenuService from './dynamic-menu.service';

export const listDynamicMenuHandler = asyncHandler(async (req, res) => {
  const result = await dynamicMenuService.listDynamicMenu(
    req.query as unknown as ListQuery & { placement?: string },
  );
  return sendPaginated(res, result.items, result.meta);
});

export const getDynamicMenuTreeHandler = asyncHandler(async (req, res) => {
  const placement = req.query.placement as string | undefined;
  return sendSuccess(res, await dynamicMenuService.getDynamicMenuTree(placement));
});

export const getDynamicMenuHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await dynamicMenuService.getDynamicMenuById(req.params.id));
});

export const createDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await dynamicMenuService.createDynamicMenu(req.body, req.user!.id));
});

export const updateDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await dynamicMenuService.updateDynamicMenu(req.params.id, req.body, req.user!.id),
  );
});

export const deleteDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  await dynamicMenuService.deleteDynamicMenu(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});

export const reorderDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  const { items } = req.body as { items: { id: string; order: number }[] };
  return sendSuccess(res, await dynamicMenuService.reorderDynamicMenu(items));
});

export const bulkDeleteDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  const { ids } = req.body as { ids: string[] };
  return sendSuccess(res, await dynamicMenuService.bulkDeleteDynamicMenu(ids, req.user!.id));
});

export const bulkUpdateDynamicMenuHandler = asyncHandler(async (req: Request, res) => {
  const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
  return sendSuccess(res, await dynamicMenuService.bulkUpdateDynamicMenu(ids, patch, req.user!.id));
});
