import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Separate collection (not embedded) — variants carry their own SKU/pricing/stock linkage and are queried independently (e.g. "variants below reorder level"). */
const productVariantSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sku: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true }, // e.g. "10 tablets", "100ml bottle"
  attributes: {
    type: [{ key: { type: String, required: true }, value: { type: String, required: true } }],
    default: [],
  },
  basePrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  reorderLevel: { type: Number, default: 10, min: 0 },
  isActive: { type: Boolean, default: true },
});

productVariantSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
productVariantSchema.index({ productId: 1, isActive: 1 });

auditPlugin(productVariantSchema);

export type ProductVariantDocument = InferSchemaType<typeof productVariantSchema>;
export const ProductVariantModel = model('ProductVariant', productVariantSchema);
