import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { createCrudRouter } from '../../utils/crud-router.factory';
import { validate } from '../../utils/validate';

import { gstSettingRepository } from './gst-setting.repository';
import * as productTaxMappingService from './product-tax-mapping.service';

const createGstSettingSchema = z.object({
  hsnCode: z.string().min(1),
  description: z.string().optional(),
  gstRate: z.number().min(0).max(28),
  cessRate: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const taxRouter = Router();

taxRouter.use(
  '/gst-settings',
  createCrudRouter({
    resource: RESOURCES.TAX,
    repository: gstSettingRepository,
    createSchema: createGstSettingSchema,
    label: 'GST setting',
    excelColumns: [
      { header: 'HSN Code', key: 'hsnCode', width: 14 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'GST Rate (%)', key: 'gstRate', width: 14 },
      { header: 'Cess Rate (%)', key: 'cessRate', width: 14 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

/**
 * Product-tax-mapping history is append-only (see product-tax-mapping.service.ts) —
 * create + list only, no update/delete of past mappings.
 */
const createMappingSchema = z.object({
  productId: z.string().min(1),
  hsnCode: z.string().min(1),
  gstRate: z.number().min(0).max(28),
  effectiveFrom: z.string().optional(),
});

const canReadTax = authorize(permission(RESOURCES.TAX, ACTIONS.READ));
const canWriteTax = authorize(permission(RESOURCES.TAX, ACTIONS.UPDATE));

taxRouter.get(
  '/product-tax-mappings',
  requireAuth,
  canReadTax,
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    return sendSuccess(res, await productTaxMappingService.listProductTaxMappings(productId));
  }),
);

taxRouter.post(
  '/product-tax-mappings',
  requireAuth,
  canWriteTax,
  validate(createMappingSchema),
  asyncHandler(async (req, res) => {
    return sendCreated(res, await productTaxMappingService.createProductTaxMapping(req.body));
  }),
);
