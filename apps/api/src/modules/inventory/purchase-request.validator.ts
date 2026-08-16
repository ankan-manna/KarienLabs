import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createPurchaseRequestSchema = z.object({
  warehouseId: objectIdSchema,
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        quantity: z.number().int().min(1),
        estimatedUnitCost: z.number().min(0).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});

export const rejectPurchaseRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const convertPurchaseRequestSchema = z.object({
  supplierId: objectIdSchema,
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        variantId: objectIdSchema.nullable().optional(),
        quantityOrdered: z.number().int().min(1),
        unitCost: z.number().min(0),
      }),
    )
    .min(1),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});
