import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

const bundleItemSchema = z.object({
  componentProductId: objectIdSchema,
  quantity: z.number().int().positive(),
});

export const createBundleSchema = z.object({
  productId: objectIdSchema,
  sellingPrice: z.number().min(0),
  isActive: z.boolean().optional(),
  items: z.array(bundleItemSchema).min(1, 'A bundle must have at least one component product'),
});

// `productId` is intentionally excluded from updates — a bundle's underlying
// sellable SKU is fixed at creation; changing it would effectively be
// creating a different bundle, not editing this one.
export const updateBundleSchema = createBundleSchema.omit({ productId: true }).partial();
