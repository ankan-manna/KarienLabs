import { Schema, model, type InferSchemaType } from 'mongoose';

const customerAnalyticsSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  lastOrderAt: { type: Date, default: null },
  averageOrderValue: { type: Number, default: 0 },
  computedAt: { type: Date, default: Date.now },
});

customerAnalyticsSchema.index({ totalSpent: -1 });

export type CustomerAnalyticsDocument = InferSchemaType<typeof customerAnalyticsSchema>;
export const CustomerAnalyticsModel = model('CustomerAnalytics', customerAnalyticsSchema);
