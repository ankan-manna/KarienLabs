import { Schema, model, type InferSchemaType } from 'mongoose';

const productAnalyticsSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  periodStart: { type: Date, required: true },
  unitsSold: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  wishlistCount: { type: Number, default: 0 },
  computedAt: { type: Date, default: Date.now },
});

productAnalyticsSchema.index({ productId: 1, periodStart: 1 }, { unique: true });
productAnalyticsSchema.index({ periodStart: 1, unitsSold: -1 });

export type ProductAnalyticsDocument = InferSchemaType<typeof productAnalyticsSchema>;
export const ProductAnalyticsModel = model('ProductAnalytics', productAnalyticsSchema);
