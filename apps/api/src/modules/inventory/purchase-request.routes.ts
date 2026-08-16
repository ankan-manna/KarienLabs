import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  approvePurchaseRequestHandler,
  convertPurchaseRequestHandler,
  createPurchaseRequestHandler,
  getPurchaseRequestHandler,
  listPurchaseRequestsHandler,
  rejectPurchaseRequestHandler,
} from './purchase-request.controller';
import {
  convertPurchaseRequestSchema,
  createPurchaseRequestSchema,
  rejectPurchaseRequestSchema,
} from './purchase-request.validator';

export const purchaseRequestRouter = Router();

const canRead = authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.READ));
const canCreate = authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.CREATE));
const canApprove = authorize(permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.APPROVE));

purchaseRequestRouter.use(requireAuth);

purchaseRequestRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  listPurchaseRequestsHandler,
);
purchaseRequestRouter.get('/:id', canRead, getPurchaseRequestHandler);
purchaseRequestRouter.post(
  '/',
  canCreate,
  validate(createPurchaseRequestSchema),
  createPurchaseRequestHandler,
);
purchaseRequestRouter.post('/:id/approve', canApprove, approvePurchaseRequestHandler);
purchaseRequestRouter.post(
  '/:id/reject',
  canApprove,
  validate(rejectPurchaseRequestSchema),
  rejectPurchaseRequestHandler,
);
purchaseRequestRouter.post(
  '/:id/convert',
  canApprove,
  validate(convertPurchaseRequestSchema),
  convertPurchaseRequestHandler,
);
