import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const bannerSchema = new Schema({
  title: { type: String, required: true },
  imageUrl: { type: String, required: true },
  linkUrl: { type: String, default: '' },
  placement: { type: String, enum: ['hero', 'category', 'checkout'], default: 'hero' },
  order: { type: Number, default: 0 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true },
});

bannerSchema.index({ placement: 1, isActive: 1, order: 1 });

auditPlugin(bannerSchema);

export type BannerDocument = InferSchemaType<typeof bannerSchema>;
export const BannerModel = model('Banner', bannerSchema);
