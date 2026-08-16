import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  cancelPurchaseOrderHandler,
  createPurchaseOrderHandler,
  getPurchaseOrderHandler,
  listPurchaseOrdersHandler,
  sendPurchaseOrderHandler,
} from './purchase-order.controller';
import { createPurchaseOrderSchema } from './purchase-order.validator';

export const purchaseOrderRouter = Router();

const canReadPo = authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.READ));
const canWritePo = authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.UPDATE));

purchaseOrderRouter.use(requireAuth);

purchaseOrderRouter.get(
  '/',
  canReadPo,
  validate(listQuerySchema, 'query'),
  listPurchaseOrdersHandler,
);
purchaseOrderRouter.get('/:id', canReadPo, getPurchaseOrderHandler);
purchaseOrderRouter.post(
  '/',
  authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.CREATE)),
  validate(createPurchaseOrderSchema),
  createPurchaseOrderHandler,
);
purchaseOrderRouter.post('/:id/send', canWritePo, sendPurchaseOrderHandler);
purchaseOrderRouter.post('/:id/cancel', canWritePo, cancelPurchaseOrderHandler);
