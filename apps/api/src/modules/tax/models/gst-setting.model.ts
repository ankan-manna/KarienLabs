import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const gstSettingSchema = new Schema({
  hsnCode: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  gstRate: { type: Number, required: true, min: 0, max: 28 },
  cessRate: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

auditPlugin(gstSettingSchema);

export type GstSettingDocument = InferSchemaType<typeof gstSettingSchema>;
export const GstSettingModel = model('GstSetting', gstSettingSchema);
