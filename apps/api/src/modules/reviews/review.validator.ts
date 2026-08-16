import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createReviewSchema = z.object({
  productId: objectIdSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(3).max(2000),
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(3).max(2000).optional(),
});
