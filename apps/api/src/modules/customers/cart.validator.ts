import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const addCartItemSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema.nullable().optional(),
  quantity: z.number().int().min(1).max(100),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(100),
});

export const applyCartCouponSchema = z.object({
  code: z.string().trim().min(1).max(40),
});
