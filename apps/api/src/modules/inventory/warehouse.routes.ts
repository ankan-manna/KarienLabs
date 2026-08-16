import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { attachBulkAndExportRoutes } from '../../utils/bulk-export-routes';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createWarehouseHandler,
  deleteWarehouseHandler,
  getWarehouseHandler,
  listWarehousesHandler,
  transferWarehouseSellerHandler,
  updateWarehouseHandler,
  warehouseTransferReportHandler,
} from './warehouse.controller';
import { warehouseRepository } from './warehouse.repository';
import {
  createWarehouseSchema,
  transferWarehouseSellerSchema,
  updateWarehouseSchema,
} from './warehouse.validator';

export const warehouseRouter = Router();

warehouseRouter.use(requireAuth);

attachBulkAndExportRoutes(warehouseRouter, {
  resource: RESOURCES.WAREHOUSES,
  repository: warehouseRepository,
  excelSheetName: 'Warehouses',
  excelColumns: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Active', key: 'isActive', width: 10 },
  ],
});

warehouseRouter.get(
  '/',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listWarehousesHandler,
);
warehouseRouter.get(
  '/:id',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.READ)),
  getWarehouseHandler,
);
warehouseRouter.get(
  '/:id/transfer-report',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.READ)),
  warehouseTransferReportHandler,
);
warehouseRouter.post(
  '/',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.CREATE)),
  validate(createWarehouseSchema),
  createWarehouseHandler,
);
warehouseRouter.patch(
  '/:id',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.UPDATE)),
  validate(updateWarehouseSchema),
  updateWarehouseHandler,
);
warehouseRouter.delete(
  '/:id',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.DELETE)),
  deleteWarehouseHandler,
);
// Dedicated, audited ownership-transfer path (Part 4) — deliberately separate
// from PATCH /:id, which cannot touch sellerId at all (see warehouse.validator.ts).
warehouseRouter.patch(
  '/:id/transfer-seller',
  authorize(permission(RESOURCES.WAREHOUSES, ACTIONS.UPDATE)),
  validate(transferWarehouseSellerSchema),
  transferWarehouseSellerHandler,
);
