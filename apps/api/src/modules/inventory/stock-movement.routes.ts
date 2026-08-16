import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import { listStockMovementsHandler } from './stock-movement.controller';

export const stockMovementRouter = Router();

stockMovementRouter.get(
  '/',
  requireAuth,
  authorize(permission(RESOURCES.INVENTORY, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listStockMovementsHandler,
);
