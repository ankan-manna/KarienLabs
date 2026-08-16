import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { objectIdSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import type { ListQuery } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import * as damagedStockService from './damaged-stock.service';

const reportDamagedStockSchema = z.object({
  batchId: objectIdSchema,
  warehouseId: objectIdSchema,
  quantity: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
  evidenceImageUrls: z.array(z.string()).optional(),
});

export const damagedStockRouter = Router();

const canRead = authorize(permission(RESOURCES.INVENTORY, ACTIONS.READ));
const canWrite = authorize(permission(RESOURCES.INVENTORY, ACTIONS.UPDATE));
const canApprove = authorize(permission(RESOURCES.INVENTORY, ACTIONS.APPROVE));

damagedStockRouter.use(requireAuth);

damagedStockRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await damagedStockService.listDamagedStock(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

damagedStockRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => sendSuccess(res, await damagedStockService.getDamagedStockById(req.params.id))),
);

damagedStockRouter.post(
  '/',
  canWrite,
  validate(reportDamagedStockSchema),
  asyncHandler(async (req: Request, res) =>
    sendCreated(res, await damagedStockService.reportDamagedStock(req.body, req.user!.id)),
  ),
);

damagedStockRouter.post(
  '/:id/approve',
  canApprove,
  asyncHandler(async (req: Request, res) =>
    sendSuccess(res, await damagedStockService.approveDamagedStock(req.params.id, req.user!.id)),
  ),
);

damagedStockRouter.delete(
  '/:id',
  canApprove,
  asyncHandler(async (req: Request, res) => {
    await damagedStockService.dismissDamagedStock(req.params.id, req.user!.id);
    return sendSuccess(res, { dismissed: true });
  }),
);
