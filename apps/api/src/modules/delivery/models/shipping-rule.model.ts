import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Folds in "shipping charges" — a charge is just the resolved value of a rule for a given cart, not a separate collection. */
const shippingRuleSchema = new Schema({
  zoneId: { type: Schema.Types.ObjectId, ref: 'ShippingZone', required: true, index: true },
  minCartValue: { type: Number, default: 0 },
  maxCartValue: { type: Number, default: null },
  charge: { type: Number, required: true, min: 0 },
  freeShippingThreshold: { type: Number, default: null },
  // Optional weight tier — omitted (null) means "any weight", so rules created
  // before this field existed keep matching every cart regardless of parcel weight.
  minWeightGrams: { type: Number, default: null },
  maxWeightGrams: { type: Number, default: null },
  // Omitted (null) means the rule applies to any delivery type — lets a store run
  // a single flat-rate rule without having to duplicate it per type.
  deliveryType: { type: String, enum: ['standard', 'express', null], default: null },
  isActive: { type: Boolean, default: true },
});

shippingRuleSchema.index({ zoneId: 1, minCartValue: 1 });

auditPlugin(shippingRuleSchema);

export type ShippingRuleDocument = InferSchemaType<typeof shippingRuleSchema>;
export const ShippingRuleModel = model('ShippingRule', shippingRuleSchema);
