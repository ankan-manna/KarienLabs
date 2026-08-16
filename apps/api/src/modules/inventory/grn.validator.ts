import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createGrnSchema = z.object({
  purchaseOrderId: objectIdSchema,
  warehouseId: objectIdSchema,
  receivedItems: z
    .array(
      z.object({
        productId: objectIdSchema,
        variantId: objectIdSchema.nullable().optional(),
        batchNumber: z.string().trim().min(1),
        mfgDate: z.coerce.date().optional(),
        expiryDate: z.coerce.date(),
        quantityReceived: z.number().int().min(1),
        unitCost: z.number().min(0),
      }),
    )
    .min(1),
});
