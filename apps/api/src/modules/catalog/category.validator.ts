import { z } from 'zod';

import { optionalObjectIdSchema } from '../../utils/common-schemas';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().optional(),
  parentId: optionalObjectIdSchema,
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  order: z.number().int().optional(),
  // (CAT-06) — see product-defaults.util.ts for how products inherit these.
  isExpirableDefault: z.boolean().optional(),
  requiresPrescriptionDefault: z.boolean().optional(),
  // Part 15/18/21/28/29 — the Mongoose model already had a `seo`
  // sub-object (and now `faq`, newly added), but neither was ever
  // reachable through the admin API — this schema didn't accept them, so
  // Zod silently stripped any value an admin form sent. Wiring them in here
  // is what actually makes Category SEO/AEO editable.
  seo: z
    .object({
      metaTitle: z.string().max(70).optional(),
      metaDescription: z.string().max(160).optional(),
      canonicalUrl: z.string().trim().max(500).optional(),
    })
    .optional(),
  faq: z.array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(2000) })).max(30).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
