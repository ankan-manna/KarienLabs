import { Schema, model, type InferSchemaType } from 'mongoose';

/** Lightweight, user-facing activity feed — distinct from AuditLog (system/security-focused). TTL'd at 1 year. */
const customerActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true }, // e.g. "order_placed", "return_requested"
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

customerActivitySchema.index({ userId: 1, createdAt: -1 });
customerActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export type CustomerActivityDocument = InferSchemaType<typeof customerActivitySchema>;
export const CustomerActivityModel = model('CustomerActivity', customerActivitySchema);
