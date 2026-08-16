import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { attachBulkAndExportRoutes } from '../../utils/bulk-export-routes';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createBrandHandler,
  deleteBrandHandler,
  getBrandHandler,
  listBrandsHandler,
  updateBrandHandler,
} from './brand.controller';
import { brandRepository } from './brand.repository';
import { createBrandSchema, updateBrandSchema } from './brand.validator';

export const brandRouter = Router();

attachBulkAndExportRoutes(brandRouter, {
  resource: RESOURCES.BRANDS,
  repository: brandRepository,
  excelSheetName: 'Brands',
  excelColumns: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Slug', key: 'slug', width: 24 },
    { header: 'Active', key: 'isActive', width: 10 },
  ],
});

brandRouter.get('/', validate(listQuerySchema, 'query'), listBrandsHandler);
brandRouter.get('/:id', getBrandHandler);

brandRouter.post(
  '/',
  requireAuth,
  authorize(permission(RESOURCES.BRANDS, ACTIONS.CREATE)),
  validate(createBrandSchema),
  createBrandHandler,
);
brandRouter.patch(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.BRANDS, ACTIONS.UPDATE)),
  validate(updateBrandSchema),
  updateBrandHandler,
);
brandRouter.delete(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.BRANDS, ACTIONS.DELETE)),
  deleteBrandHandler,
);
