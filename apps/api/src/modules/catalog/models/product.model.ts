import { DRUG_SCHEDULES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Images/gallery/SEO/specifications are embedded, not separate collections —
 * they're bounded (a few dozen entries at most) and always read together with
 * the product, so embedding avoids a join on every product-detail request.
 * Batch/expiry/quantity are NOT here — those are batch-level (see inventory
 * domain), since one product SKU has many batches with different expiry dates.
 */
const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, default: '' },
  shortDescription: { type: String, default: '' },

  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
  manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null, index: true },
  tags: { type: [String], default: [], index: true },

  images: {
    type: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
      },
    ],
    default: [],
  },

  specifications: {
    type: [{ key: { type: String, required: true }, value: { type: String, required: true } }],
    default: [],
  },

  // Prompt 23 Part 28/29/30 — see Category.faq's comment; same embedded,
  // admin-authored-only, factual-content-only pattern (e.g. "What is the
  // available strength?", "Is prescription required?", "What is the package
  // size?" — Part 28's own examples). Never auto-generated.
  faq: {
    type: [{ question: { type: String, required: true }, answer: { type: String, required: true } }],
    default: [],
  },

  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
  },

  // Medicine-specific master data.
  medicine: {
    genericName: { type: String, default: '' },
    composition: { type: String, default: '' },
    dosageForm: { type: String, default: '' }, // tablet, syrup, injection, ...
    strength: { type: String, default: '' }, // e.g. "500mg"
    schedule: { type: String, enum: Object.values(DRUG_SCHEDULES), default: DRUG_SCHEDULES.NONE },
    // Prompt 12 (CAT-06): tri-state — `null`/unset means "not explicitly set on
    // this product, fall back to category.requiresPrescriptionDefault" (see
    // product-defaults.util.ts's resolveProductDefaults). Deliberately no
    // `default: false` here anymore (that would make every new product
    // permanently opt out of category inheritance, since Mongoose would
    // stamp `false` on every insert) — existing documents that already have
    // an explicit `true`/`false` stored are completely unaffected by this
    // schema change; only brand-new products default to "unset" going forward.
    prescriptionRequired: { type: Boolean, default: null, index: true },
    storageInstructions: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    // Prompt 12 (CAT-06) — cold-chain handling requirement. Not tri-state
    // (unlike prescriptionRequired/expirable): a product either needs cold
    // storage or it doesn't, there's no category-level cold-chain default to
    // inherit from.
    coldStorage: { type: Boolean, default: false },
  },

  // Prompt 12 (CAT-06) — tri-state, same inheritance pattern as
  // medicine.prescriptionRequired: `null`/unset falls back to
  // category.isExpirableDefault; an explicit `true`/`false` always wins.
  expirable: { type: Boolean, default: null },

  // Prompt 12 (CAT-03) — Shiprocket create-order API's mandatory dimension
  // fields, exposed now so the later Shiprocket prompt doesn't need another
  // schema migration. Grams/millimeters (not kg/cm) so every stored value is
  // an integer-friendly, unambiguous unit — no "was this in kg or g" guessing.
  weightGrams: { type: Number, default: null, min: 0 },
  lengthMm: { type: Number, default: null, min: 0 },
  widthMm: { type: Number, default: null, min: 0 },
  heightMm: { type: Number, default: null, min: 0 },
  // Prompt 12 (CAT-03) — distinct from `sku` (the internal catalog identifier):
  // barcode is the physical pack's scannable code (EAN/UPC/etc.), globally
  // unique, but NOT required (existing products may not have one yet — see
  // the partial unique index below). HSN (medicine.hsnCode above) is
  // deliberately left NOT unique — many SKUs legitimately share one HSN.
  barcode: { type: String, default: null, trim: true },

  // Prompt 12 (CAT-05) — set automatically by bundle.service.ts when a Bundle
  // document is created referencing this product as its sellable SKU. Lets
  // checkout/cart/storefront code detect "this product needs bundle-component
  // expansion" via a single indexed boolean instead of a Bundle lookup on
  // every product read.
  isBundle: { type: Boolean, default: false, index: true },

  gstRate: { type: Number, default: 0, min: 0, max: 28 },
  basePrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  // Prompt 30 (product-level shipping) — a per-unit commercial shipping
  // charge the admin configures per product, distinct from `weightGrams`/
  // `lengthMm`/etc. above (those are PHYSICAL attributes used to compute
  // the COURIER's cost via Shiprocket — Part 6/7 of that prompt); this is
  // what the CUSTOMER is charged, aggregated at checkout alongside the
  // existing order-level zone/weight-based ShippingRule engine
  // (shipping-calculation.service.ts), not a replacement for it — see
  // order.service.ts's buildCheckoutDraft for how the two are summed.
  // `default: 0` mirrors `gstRate`'s own backward-compatible default:
  // existing products get no NEW charge until an admin explicitly sets one.
  shippingCharge: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 10, min: 0 },

  // Prompt 16 Part 5 — return-eligibility extension point. The project
  // documentation doesn't define a universal "which medicines can never be
  // returned" rule, so rather than inventing one, this is a plain
  // per-product admin toggle (default true = returnable, matching most
  // general merchandise) that return.service.ts's eligibility check
  // consults directly. `nonReturnableReason` is admin-facing context shown
  // to the customer when a return request is blocked by this flag.
  isReturnable: { type: Boolean, default: true },
  nonReturnableReason: { type: String, default: '' },

  hasVariants: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },

  // Denormalized from Review documents (see modules/reviews) — recomputed on every
  // review create/update/delete so listing/detail pages can show ratings without an
  // extra aggregation query per product.
  ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
});

productSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
// Partial + excludes null so the many products without a barcode yet don't
// collide on a shared `null` value — only real, non-empty barcodes are
// required to be unique. Deliberately NOT applied to medicine.hsnCode
// (business logic explicitly allows multiple SKUs to share one HSN).
productSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, barcode: { $type: 'string' } } },
);
productSchema.index({ name: 'text', 'medicine.genericName': 'text', description: 'text' });
productSchema.index({ categoryId: 1, isActive: 1 });

auditPlugin(productSchema);

export type ProductDocument = InferSchemaType<typeof productSchema>;
export const ProductModel = model('Product', productSchema);
