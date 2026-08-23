import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Self-referencing tree — one collection covers both categories and subcategories via `parentId`. */
const categorySchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  // (CAT-06) — category-level defaults a product inherits when its
  // own `expirable`/`medicine.prescriptionRequired` field is unset (`null`).
  // See product-defaults.util.ts's resolveProductDefaults for the resolution
  // rule; these are plain non-nullable booleans (a category itself has no
  // further fallback to inherit from), with sane pharma-catalog defaults —
  // most medical products DO expire, most are NOT prescription-only.
  isExpirableDefault: { type: Boolean, default: true },
  requiresPrescriptionDefault: { type: Boolean, default: false },
  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    // Part 15/21 — Product already had this field (Category didn't,
    // an inconsistency); additive with a safe default, existing categories
    // are unaffected until an admin sets one.
    canonicalUrl: { type: String, default: '' },
  },
  // Part 28/29/30 — lightweight, generic FAQ content for
  // Answer-Engine-Optimization. Embedded (bounded, always read with the
  // category) rather than a separate collection — mirrors how
  // `specifications`/`images` are embedded on Product for the same reason.
  // Purely admin-authored factual content; nothing here is auto-generated
  // from an LLM or inferred, per Part 26/29's "never fabricate" rule.
  faq: {
    type: [{ question: { type: String, required: true }, answer: { type: String, required: true } }],
    default: [],
  },
});

categorySchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
categorySchema.index({ parentId: 1, order: 1 });

auditPlugin(categorySchema);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model('Category', categorySchema);
