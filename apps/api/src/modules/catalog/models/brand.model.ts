import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const brandSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  logoUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
});

brandSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

auditPlugin(brandSchema);

export type BrandDocument = InferSchemaType<typeof brandSchema>;
export const BrandModel = model('Brand', brandSchema);
