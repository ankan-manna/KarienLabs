import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { attachBulkAndExportRoutes } from '../../utils/bulk-export-routes';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createManufacturerHandler,
  deleteManufacturerHandler,
  getManufacturerHandler,
  listManufacturersHandler,
  updateManufacturerHandler,
} from './manufacturer.controller';
import { manufacturerRepository } from './manufacturer.repository';
import { createManufacturerSchema, updateManufacturerSchema } from './manufacturer.validator';

export const manufacturerRouter = Router();

attachBulkAndExportRoutes(manufacturerRouter, {
  resource: RESOURCES.MANUFACTURERS,
  repository: manufacturerRepository,
  excelSheetName: 'Manufacturers',
  excelColumns: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Slug', key: 'slug', width: 24 },
    { header: 'License Number', key: 'licenseNumber', width: 20 },
    { header: 'Active', key: 'isActive', width: 10 },
  ],
});

manufacturerRouter.get('/', validate(listQuerySchema, 'query'), listManufacturersHandler);
manufacturerRouter.get('/:id', getManufacturerHandler);

manufacturerRouter.post(
  '/',
  requireAuth,
  authorize(permission(RESOURCES.MANUFACTURERS, ACTIONS.CREATE)),
  validate(createManufacturerSchema),
  createManufacturerHandler,
);
manufacturerRouter.patch(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.MANUFACTURERS, ACTIONS.UPDATE)),
  validate(updateManufacturerSchema),
  updateManufacturerHandler,
);
manufacturerRouter.delete(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.MANUFACTURERS, ACTIONS.DELETE)),
  deleteManufacturerHandler,
);
