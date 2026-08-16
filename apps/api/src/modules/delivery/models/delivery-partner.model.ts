import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const deliveryPartnerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  contactPhone: { type: String, default: '' },
  serviceablePincodes: { type: [String], default: [] }, // empty = all
  apiConfig: { type: Schema.Types.Mixed, default: {} },
  isActive: { type: Boolean, default: true },
});

auditPlugin(deliveryPartnerSchema);

export type DeliveryPartnerDocument = InferSchemaType<typeof deliveryPartnerSchema>;
export const DeliveryPartnerModel = model('DeliveryPartner', deliveryPartnerSchema);
