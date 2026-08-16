import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().optional(),
  logoUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
