import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  approveStockAdjustmentHandler,
  getStockAdjustmentHandler,
  listStockAdjustmentsHandler,
  quickAddStockHandler,
  rejectStockAdjustmentHandler,
  requestStockAdjustmentHandler,
} from './stock-adjustment.controller';
import { createStockAdjustmentSchema, quickAddStockSchema } from './stock-adjustment.validator';

export const stockAdjustmentRouter = Router();

const canRead = authorize(permission(RESOURCES.INVENTORY, ACTIONS.READ));
const canWrite = authorize(permission(RESOURCES.INVENTORY, ACTIONS.UPDATE));
const canApprove = authorize(permission(RESOURCES.INVENTORY, ACTIONS.APPROVE));

stockAdjustmentRouter.use(requireAuth);

stockAdjustmentRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  listStockAdjustmentsHandler,
);
stockAdjustmentRouter.get('/:id', canRead, getStockAdjustmentHandler);
stockAdjustmentRouter.post(
  '/',
  canWrite,
  validate(createStockAdjustmentSchema),
  requestStockAdjustmentHandler,
);
// (Admin Inventory Management) Part 12/24 — "Add Inventory": the
// single-step counterpart to the two-step request/approve flow above, same
// `inventory:update` gate as requesting one (Part 24: "Platform Admin
// allowed if existing inventory permission grants access" — this is that
// existing permission, not a new one).
stockAdjustmentRouter.post(
  '/quick-add',
  canWrite,
  validate(quickAddStockSchema),
  quickAddStockHandler,
);
stockAdjustmentRouter.post('/:id/approve', canApprove, approveStockAdjustmentHandler);
stockAdjustmentRouter.post('/:id/reject', canApprove, rejectStockAdjustmentHandler);
