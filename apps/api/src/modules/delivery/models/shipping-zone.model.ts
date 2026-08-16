import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const shippingZoneSchema = new Schema({
  name: { type: String, required: true, trim: true },
  states: { type: [String], default: [] },
  pincodes: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
});

auditPlugin(shippingZoneSchema);

export type ShippingZoneDocument = InferSchemaType<typeof shippingZoneSchema>;
export const ShippingZoneModel = model('ShippingZone', shippingZoneSchema);
