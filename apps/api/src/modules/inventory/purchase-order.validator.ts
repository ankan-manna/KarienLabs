import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createPurchaseOrderSchema = z.object({
  supplierId: objectIdSchema,
  warehouseId: objectIdSchema,
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
