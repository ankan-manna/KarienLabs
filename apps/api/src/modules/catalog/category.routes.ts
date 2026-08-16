import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { attachBulkAndExportRoutes } from '../../utils/bulk-export-routes';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createCategoryHandler,
  deleteCategoryHandler,
  getCategoryHandler,
  listCategoriesFlatHandler,
  listCategoriesHandler,
  updateCategoryHandler,
} from './category.controller';
import { categoryRepository } from './category.repository';
import { createCategorySchema, updateCategorySchema } from './category.validator';

export const categoryRouter = Router();

attachBulkAndExportRoutes(categoryRouter, {
  resource: RESOURCES.CATEGORIES,
  repository: categoryRepository,
  excelSheetName: 'Categories',
  excelColumns: [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Slug', key: 'slug', width: 24 },
    { header: 'Parent', key: 'parentId', width: 24 },
    { header: 'Active', key: 'isActive', width: 10 },
  ],
});

categoryRouter.get('/', listCategoriesHandler);
categoryRouter.get(
  '/flat',
  requireAuth,
  authorize(permission(RESOURCES.CATEGORIES, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listCategoriesFlatHandler,
);
categoryRouter.get('/:id', getCategoryHandler);

categoryRouter.post(
  '/',
  requireAuth,
  authorize(permission(RESOURCES.CATEGORIES, ACTIONS.CREATE)),
  validate(createCategorySchema),
  createCategoryHandler,
);
categoryRouter.patch(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.CATEGORIES, ACTIONS.UPDATE)),
  validate(updateCategorySchema),
  updateCategoryHandler,
);
categoryRouter.delete(
  '/:id',
  requireAuth,
  authorize(permission(RESOURCES.CATEGORIES, ACTIONS.DELETE)),
  deleteCategoryHandler,
);
