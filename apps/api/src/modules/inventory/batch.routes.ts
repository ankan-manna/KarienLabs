import { ACTIONS, BATCH_STATUS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  getBatchHandler,
  listBatchesHandler,
  lowStockReportHandler,
  nearExpiryReportHandler,
  updateBatchMrpHandler,
  updateBatchRecallHandler,
  updateBatchStatusHandler,
} from './batch.controller';

const updateBatchStatusSchema = z.object({
  status: z.enum(Object.values(BATCH_STATUS) as [string, ...string[]]),
});

// CAT-04 — `null` explicitly clears the override back to "use Product.mrp".
const updateBatchMrpSchema = z.object({
  mrp: z.number().min(0).nullable(),
});

const updateBatchRecallSchema = z.object({
  recallFlag: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const batchRouter = Router();

const canRead = authorize(permission(RESOURCES.BATCHES, ACTIONS.READ));
const canUpdate = authorize(permission(RESOURCES.BATCHES, ACTIONS.UPDATE));

batchRouter.use(requireAuth, canRead);

batchRouter.get('/', validate(listQuerySchema, 'query'), listBatchesHandler);
batchRouter.get('/reports/low-stock', lowStockReportHandler);
batchRouter.get('/reports/near-expiry', nearExpiryReportHandler);
batchRouter.get('/:id', getBatchHandler);
batchRouter.patch(
  '/:id/status',
  canUpdate,
  validate(updateBatchStatusSchema),
  updateBatchStatusHandler,
);
batchRouter.patch('/:id/mrp', canUpdate, validate(updateBatchMrpSchema), updateBatchMrpHandler);
batchRouter.patch(
  '/:id/recall',
  canUpdate,
  validate(updateBatchRecallSchema),
  updateBatchRecallHandler,
);
