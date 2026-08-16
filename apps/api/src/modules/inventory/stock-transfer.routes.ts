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

import * as stockTransferService from './stock-transfer.service';

const requestTransferSchema = z.object({
  batchId: objectIdSchema,
  fromWarehouseId: objectIdSchema,
  toWarehouseId: objectIdSchema,
  quantity: z.number().int().min(1),
});

export const stockTransferRouter = Router();

const canRead = authorize(permission(RESOURCES.INVENTORY, ACTIONS.READ));
const canWrite = authorize(permission(RESOURCES.INVENTORY, ACTIONS.UPDATE));
const canApprove = authorize(permission(RESOURCES.INVENTORY, ACTIONS.APPROVE));

stockTransferRouter.use(requireAuth);

stockTransferRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await stockTransferService.listStockTransfers(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

stockTransferRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => sendSuccess(res, await stockTransferService.getStockTransferById(req.params.id))),
);

stockTransferRouter.post(
  '/',
  canWrite,
  validate(requestTransferSchema),
  asyncHandler(async (req: Request, res) =>
    sendCreated(res, await stockTransferService.requestStockTransfer(req.body, req.user!.id)),
  ),
);

stockTransferRouter.post(
  '/:id/receive',
  canApprove,
  asyncHandler(async (req: Request, res) =>
    sendSuccess(res, await stockTransferService.receiveStockTransfer(req.params.id, req.user!.id)),
  ),
);

stockTransferRouter.post(
  '/:id/cancel',
  canWrite,
  asyncHandler(async (req: Request, res) =>
    sendSuccess(res, await stockTransferService.cancelStockTransfer(req.params.id, req.user!.id)),
  ),
);
