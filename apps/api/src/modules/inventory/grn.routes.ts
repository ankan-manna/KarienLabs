import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { validate } from '../../utils/validate';

import { createGrnHandler, getGrnHandler } from './grn.controller';
import { createGrnSchema } from './grn.validator';

export const grnRouter = Router();

grnRouter.use(requireAuth);

grnRouter.get(
  '/:id',
  authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.READ)),
  getGrnHandler,
);
grnRouter.post(
  '/',
  authorize(permission(RESOURCES.INVENTORY, ACTIONS.CREATE)),
  validate(createGrnSchema),
  createGrnHandler,
);
