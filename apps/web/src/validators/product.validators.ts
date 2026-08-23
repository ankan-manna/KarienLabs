import { z } from 'zod';

// Tri-state fields (CAT-06) are represented in the form as a 3-way choice
// rather than a checkbox — "Inherit from category" has no honest checkbox
// state of its own. Converted to null/true/false at submit time (see
// ProductFormDrawer.tsx) before hitting the API, which is what actually
// expects the null/true/false tri-state per product.model.ts.
export const TRI_STATE_OPTIONS = [
  { label: 'Inherit from category', value: 'inherit' },
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
] as const;

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  sku: z.string().trim().min(2, 'SKU is too short'),
  categoryId: z.string().min(1, 'Select a category'),
  brandId: z.string().optional(),
  basePrice: z.coerce.number().min(0, 'Must be 0 or more'),
  mrp: z.coerce.number().min(0, 'Must be 0 or more'),
  gstRate: z.coerce.number().min(0).max(28).optional(),
   // per-unit commercial shipping charge.
  shippingCharge: z.coerce.number().min(0, 'Must be 0 or more').optional(),
  reorderLevel: z.coerce.number().min(0).optional(),
  genericName: z.string().optional(),
  prescriptionRequired: z.enum(['inherit', 'true', 'false']),
  expirable: z.enum(['inherit', 'true', 'false']),
  coldStorage: z.boolean().optional(),
  isActive: z.boolean().optional(),
  // (CAT-03) — all optional; kept as strings in the form (empty
  // string = "not set") and coerced to number|null on submit.
  barcode: z.string().optional(),
  weightGrams: z.string().optional(),
  lengthMm: z.string().optional(),
  widthMm: z.string().optional(),
  heightMm: z.string().optional(),
  // Part 13/18/40 — SEO metadata; all optional, matches the
  // backend's `seo` sub-object (product.model.ts / product.validator.ts).
  seoTitle: z.string().max(70, 'Keep under 70 characters for search results').optional(),
  seoDescription: z.string().max(160, 'Keep under 160 characters for search results').optional(),
  seoCanonicalUrl: z.string().max(500).optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
