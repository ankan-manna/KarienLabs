import { z } from 'zod';

export const createBannerSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().min(1),
  imagePublicId: z.string().nullable().optional(),
  linkUrl: z.string().optional(),
  ctaText: z.string().optional(),
  placement: z.enum(['hero', 'category', 'checkout']).optional(),
  order: z.number().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  slideDurationMs: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createHomeSectionSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['product_grid', 'category_grid', 'banner_carousel']),
  sourceType: z.enum(['manual', 'category', 'tag', 'query']).optional(),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const createPageSchema = z.object({
  slug: z.string().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  isPublished: z.boolean().optional(),
  seo: z
    .object({ metaTitle: z.string().optional(), metaDescription: z.string().optional() })
    .optional(),
});

export const createBlogSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1),
  coverImageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().optional(),
  seo: z
    .object({ metaTitle: z.string().optional(), metaDescription: z.string().optional() })
    .optional(),
});
