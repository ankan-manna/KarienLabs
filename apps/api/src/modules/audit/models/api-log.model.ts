import { Schema, model, type InferSchemaType } from 'mongoose';

/** Request/response audit for compliance review — high volume by nature, so TTL'd short (30 days) relative to AuditLog. */
const apiLogSchema = new Schema({
  requestId: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true, index: true },
  statusCode: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

apiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type ApiLogDocument = InferSchemaType<typeof apiLogSchema>;
export const ApiLogModel = model('ApiLog', apiLogSchema);
