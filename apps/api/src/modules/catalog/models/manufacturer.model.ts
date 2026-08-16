import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const manufacturerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  licenseNumber: { type: String, default: '' },
  address: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
});

manufacturerSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

auditPlugin(manufacturerSchema);

export type ManufacturerDocument = InferSchemaType<typeof manufacturerSchema>;
export const ManufacturerModel = model('Manufacturer', manufacturerSchema);
