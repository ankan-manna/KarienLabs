import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Materialized rollup, not computed per-request — a scheduled worker job aggregates
 * Orders into this collection (daily and monthly share the same shape, distinguished
 * by `period`, avoiding two near-identical collections). Report generation logic
 * itself lands with the Order Analytics domain in  7.
 */
const salesSummarySchema = new Schema({
  period: { type: String, enum: ['daily', 'monthly'], required: true },
  periodStart: { type: Date, required: true },
  orderCount: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  gstCollected: { type: Number, default: 0 },
  discountGiven: { type: Number, default: 0 },
  refundsIssued: { type: Number, default: 0 },
  computedAt: { type: Date, default: Date.now },
});

salesSummarySchema.index({ period: 1, periodStart: 1 }, { unique: true });

export type SalesSummaryDocument = InferSchemaType<typeof salesSummarySchema>;
export const SalesSummaryModel = model('SalesSummary', salesSummarySchema);
