import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { bulkIdsSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  bulkDeleteSuppliersHandler,
  bulkEditSuppliersHandler,
  createSupplierHandler,
  deleteSupplierHandler,
  exportSuppliersHandler,
  getSupplierHandler,
  listSuppliersHandler,
  supplierPurchaseHistoryHandler,
  updateSupplierHandler,
} from './supplier.controller';
import { bulkEditSuppliersSchema, createSupplierSchema, updateSupplierSchema } from './supplier.validator';

export const supplierRouter = Router();

supplierRouter.use(requireAuth);

supplierRouter.get(
  '/',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listSuppliersHandler,
);
supplierRouter.get(
  '/:id',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.READ)),
  getSupplierHandler,
);
supplierRouter.get(
  '/:id/purchase-history',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  supplierPurchaseHistoryHandler,
);
supplierRouter.post(
  '/',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.CREATE)),
  validate(createSupplierSchema),
  createSupplierHandler,
);
supplierRouter.patch(
  '/:id',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.UPDATE)),
  validate(updateSupplierSchema),
  updateSupplierHandler,
);
supplierRouter.delete(
  '/:id',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.DELETE)),
  deleteSupplierHandler,
);
supplierRouter.get(
  '/export/excel',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.EXPORT)),
  exportSuppliersHandler,
);
supplierRouter.post(
  '/bulk-delete',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.DELETE)),
  validate(bulkIdsSchema),
  bulkDeleteSuppliersHandler,
);
supplierRouter.post(
  '/bulk-edit',
  authorize(permission(RESOURCES.SUPPLIERS, ACTIONS.UPDATE)),
  validate(bulkEditSuppliersSchema),
  bulkEditSuppliersHandler,
);
