import { DRUG_SCHEDULES } from '@medcommerce/shared';
import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

const medicineSchema = z.object({
  genericName: z.string().optional(),
  composition: z.string().optional(),
  dosageForm: z.string().optional(),
  strength: z.string().optional(),
  schedule: z.enum(Object.values(DRUG_SCHEDULES) as [string, ...string[]]).optional(),
  // Tri-state (CAT-06) — `null` explicitly clears back to "inherit from
  // category", distinct from simply omitting the key on a PATCH (which
  // leaves whatever was already stored untouched). `.nullable()` allows both.
  prescriptionRequired: z.boolean().nullable().optional(),
  storageInstructions: z.string().optional(),
  hsnCode: z.string().optional(),
  coldStorage: z.boolean().optional(),
});

// SKU: preserve the existing allowed pattern (alphanumeric plus _ - . /) — the
// business-logic reference explicitly calls these separators out; this is
// unchanged from before, just made explicit rather than left to `.min/.max`
// alone so a genuinely invalid character is rejected instead of silently accepted.
const skuSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[A-Za-z0-9_\-./]+$/, 'SKU may only contain letters, numbers, and _ - . /');

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().toLowerCase().optional(),
  sku: skuSchema,
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(500).optional(),
  categoryId: objectIdSchema,
  brandId: objectIdSchema.nullable().optional(),
  manufacturerId: objectIdSchema.nullable().optional(),
  tags: z.array(z.string()).optional(),
  specifications: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  // Part 13/14/18/21 — `canonicalUrl` already existed on the
  // Mongoose model but was missing here, meaning an admin-supplied value was
  // silently stripped (Zod's default `z.object()` drops unknown keys rather
  // than rejecting them) before ever reaching the database.
  seo: z
    .object({
      metaTitle: z.string().max(70).optional(),
      metaDescription: z.string().max(160).optional(),
      canonicalUrl: z.string().trim().max(500).optional(),
    })
    .optional(),
   // Part 28/29 — AEO FAQ content, admin-authored only.
  faq: z.array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(2000) })).max(30).optional(),
  medicine: medicineSchema.optional(),
  // Tri-state (CAT-06) — same "null clears to category default" semantics as medicine.prescriptionRequired.
  expirable: z.boolean().nullable().optional(),
  // (CAT-03) — Shiprocket-required physical attributes, all optional
  // (existing products may not have these yet — see Part 15 migration notes).
  weightGrams: z.number().min(0).nullable().optional(),
  lengthMm: z.number().min(0).nullable().optional(),
  widthMm: z.number().min(0).nullable().optional(),
  heightMm: z.number().min(0).nullable().optional(),
  // Trimmed + empty-string treated as "no barcode" (not a value to enforce
  // uniqueness against) — see product.service.ts's barcode handling.
  barcode: z.string().trim().max(64).nullable().optional(),
   // Part 5 — per-product return-eligibility override.
  isReturnable: z.boolean().optional(),
  nonReturnableReason: z.string().trim().max(300).optional(),
  gstRate: z.number().min(0).max(28).optional(),
  basePrice: z.number().min(0),
  mrp: z.number().min(0),
  // product-level commercial shipping charge (Part 4/26:
  // numeric, non-negative; no upper bound imposed here since — unlike GST —
  // there is no legal/business ceiling on a shipping charge).
  shippingCharge: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  hasVariants: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const bulkEditProductsSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
  patch: updateProductSchema,
});

// (Product Image Management) — the main image now has its own
// dedicated endpoint/schema (`setMainProductImageSchema` below), so this one
// is exclusively for sub/additional images; `isPrimary` is gone; the max-count
// enforcement happens in the service layer (needs a DB read of the current
// image list + the configured limit, not expressible in a static Zod schema).
export const addProductImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
});

export const setMainProductImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
});

export const reorderSubImagesSchema = z.object({
  publicIds: z.array(z.string().min(1)).min(1),
});
