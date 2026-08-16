import { Schema, model, type InferSchemaType } from 'mongoose';

const roleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    permissions: { type: [String], default: [], index: true },
    isSystem: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

roleSchema.index({ deletedAt: 1 });

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const RoleModel = model('Role', roleSchema);
