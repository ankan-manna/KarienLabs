import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * A Bundle/combo-pack IS itself a sellable catalog SKU — `productId` points
 * at an ordinary Product document (see product.model.ts's `isBundle` flag,
 * set true by bundle.service.ts when this document is created) rather than
 * duplicating name/image/category/brand fields here. One Bundle per Product
 * (a product is either a plain SKU or a bundle SKU, never both configurations
 * at once — see the unique index below).
 *
 * `sellingPrice` is independently admin-controlled — Prompt 12 explicitly
 * forbids auto-deriving it from the sum of component prices (e.g. components
 * totalling ₹600 sold as a ₹499 combo). See bundle-item.model.ts's
 * `priceRatio` for how that ₹499 is later apportioned across components for
 * tax purposes ONLY, never to recompute what the customer paid.
 */
const bundleSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sellingPrice: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
});

bundleSchema.index({ productId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

auditPlugin(bundleSchema);

export type BundleDocument = InferSchemaType<typeof bundleSchema>;
export const BundleModel = model('Bundle', bundleSchema);
