import { Schema, model, type InferSchemaType } from 'mongoose';

/** Time-bound history of a product's tax rate — Product.gstRate caches the current value for fast checkout math; this is the audit/history trail behind it. */
const productTaxMappingSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  hsnCode: { type: String, required: true },
  gstRate: { type: Number, required: true, min: 0, max: 28 },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

productTaxMappingSchema.index({ productId: 1, effectiveFrom: -1 });

export type ProductTaxMappingDocument = InferSchemaType<typeof productTaxMappingSchema>;
export const ProductTaxMappingModel = model('ProductTaxMapping', productTaxMappingSchema);
