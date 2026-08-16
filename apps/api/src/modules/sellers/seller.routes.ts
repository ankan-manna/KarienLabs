import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { bulkIdsSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  bulkDeleteSellersHandler,
  bulkEditSellersHandler,
  createSellerHandler,
  deleteSellerHandler,
  exportSellersHandler,
  getSellerHandler,
  getSellerSummaryHandler,
  listSellerWarehousesHandler,
  listSellersHandler,
  updateSellerHandler,
  updateSellerStatusHandler,
} from './seller.controller';
import {
  bulkEditSellersSchema,
  createSellerSchema,
  updateSellerSchema,
  updateSellerStatusSchema,
} from './seller.validator';

export const sellerRouter = Router();

sellerRouter.use(requireAuth);

sellerRouter.get(
  '/',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listSellersHandler,
);
sellerRouter.get('/:id', authorize(permission(RESOURCES.SELLERS, ACTIONS.READ)), getSellerHandler);
sellerRouter.get(
  '/:id/warehouses',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listSellerWarehousesHandler,
);
sellerRouter.get(
  '/:id/summary',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.READ)),
  getSellerSummaryHandler,
);
sellerRouter.post(
  '/',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.CREATE)),
  validate(createSellerSchema),
  createSellerHandler,
);
sellerRouter.patch(
  '/:id',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.UPDATE)),
  validate(updateSellerSchema),
  updateSellerHandler,
);
// Dedicated enable/disable action (Part 10's seller.enable/seller.disable) —
// mapped onto the same `sellers:update` permission as the generic edit,
// since this codebase's RBAC vocabulary is resource:action, not a distinct
// permission per status value; the audit trail still records it as its own
// clean "enabled: true/false" event (see seller.service.ts).
sellerRouter.patch(
  '/:id/status',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.UPDATE)),
  validate(updateSellerStatusSchema),
  updateSellerStatusHandler,
);
sellerRouter.delete(
  '/:id',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.DELETE)),
  deleteSellerHandler,
);
sellerRouter.get(
  '/export/excel',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.EXPORT)),
  exportSellersHandler,
);
sellerRouter.post(
  '/bulk-delete',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.DELETE)),
  validate(bulkIdsSchema),
  bulkDeleteSellersHandler,
);
sellerRouter.post(
  '/bulk-edit',
  authorize(permission(RESOURCES.SELLERS, ACTIONS.UPDATE)),
  validate(bulkEditSellersSchema),
  bulkEditSellersHandler,
);
