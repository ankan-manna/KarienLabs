import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * One row per component product in a Bundle. `priceRatio` is computed once
 * at bundle creation/edit time (`quantity * component.mrp` / sum across all
 * items — see bundle.service.ts) and is used ONLY for future GST/tax
 * apportionment of the bundle's actual charged price across components; it
 * never influences what the customer is charged (that's Bundle.sellingPrice,
 * set independently).
 */
const bundleItemSchema = new Schema({
  bundleId: { type: Schema.Types.ObjectId, ref: 'Bundle', required: true, index: true },
  componentProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  quantity: { type: Number, required: true, min: 1 },
  priceRatio: { type: Number, required: true, min: 0, max: 1 },
});

// A component product can only appear once per bundle (Part 7 validation:
// "Duplicate component entries unless explicitly supported" — not supported).
bundleItemSchema.index(
  { bundleId: 1, componentProductId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

auditPlugin(bundleItemSchema);

export type BundleItemDocument = InferSchemaType<typeof bundleItemSchema>;
export const BundleItemModel = model('BundleItem', bundleItemSchema);
