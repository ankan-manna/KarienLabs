import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { exportImportRateLimiter } from '../../middlewares/rate-limit.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { uploadExcelFile } from '../../middlewares/upload.middleware';
import { bulkIdsSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  addSubProductImageHandler,
  bulkDeleteProductsHandler,
  bulkEditProductsHandler,
  createProductHandler,
  deleteProductHandler,
  exportProductsHandler,
  getProductHandler,
  getProductImageConfigHandler,
  importProductsHandler,
  listProductsHandler,
  removeSubProductImageHandler,
  reorderSubProductImagesHandler,
  setMainProductImageHandler,
  updateProductHandler,
} from './product.controller';
import {
  addProductImageSchema,
  bulkEditProductsSchema,
  createProductSchema,
  reorderSubImagesSchema,
  setMainProductImageSchema,
  updateProductSchema,
} from './product.validator';

export const productRouter = Router();

// Listing/detail are public storefront reads — no requireAuth on those two routes below.
const canCreate = authorize(permission(RESOURCES.PRODUCTS, ACTIONS.CREATE));
const canUpdate = authorize(permission(RESOURCES.PRODUCTS, ACTIONS.UPDATE));
const canDelete = authorize(permission(RESOURCES.PRODUCTS, ACTIONS.DELETE));
const canImport = authorize(permission(RESOURCES.PRODUCTS, ACTIONS.IMPORT));
const canExport = authorize(permission(RESOURCES.PRODUCTS, ACTIONS.EXPORT));

productRouter.get('/', validate(listQuerySchema, 'query'), listProductsHandler);
productRouter.get('/export/excel', requireAuth, canExport, exportImportRateLimiter, exportProductsHandler);
// (Product Image Management) Part 4/28 — must be registered before
// `/:id` (Express matches routes in order; without this, "config" would be
// parsed as a product id). `requireAuth` only, no specific permission — any
// authenticated staff member needs to know the current limit to enforce it
// client-side, not just whoever holds `configuration:read` (Super Admin only).
productRouter.get('/config/image-limits', requireAuth, getProductImageConfigHandler);
productRouter.get('/:id', getProductHandler);

productRouter.post(
  '/',
  requireAuth,
  canCreate,
  validate(createProductSchema),
  createProductHandler,
);
productRouter.patch(
  '/:id',
  requireAuth,
  canUpdate,
  validate(updateProductSchema),
  updateProductHandler,
);
productRouter.delete('/:id', requireAuth, canDelete, deleteProductHandler);

productRouter.post(
  '/bulk-edit',
  requireAuth,
  canUpdate,
  validate(bulkEditProductsSchema),
  bulkEditProductsHandler,
);
productRouter.post(
  '/bulk-delete',
  requireAuth,
  canDelete,
  validate(bulkIdsSchema),
  bulkDeleteProductsHandler,
);

productRouter.put(
  '/:id/images/main',
  requireAuth,
  canUpdate,
  validate(setMainProductImageSchema),
  setMainProductImageHandler,
);
productRouter.post(
  '/:id/images',
  requireAuth,
  canUpdate,
  validate(addProductImageSchema),
  addSubProductImageHandler,
);
productRouter.patch(
  '/:id/images/reorder',
  requireAuth,
  canUpdate,
  validate(reorderSubImagesSchema),
  reorderSubProductImagesHandler,
);
productRouter.delete('/:id/images/:publicId', requireAuth, canUpdate, removeSubProductImageHandler);

productRouter.post(
  '/import',
  requireAuth,
  canImport,
  exportImportRateLimiter,
  uploadExcelFile,
  importProductsHandler,
);
