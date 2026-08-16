import { Schema, model, type InferSchemaType } from 'mongoose';

/** Persisted server errors for an admin-visible error dashboard — supplements (not replaces) Pino stdout logs. TTL'd 90 days. */
const errorLogSchema = new Schema({
  message: { type: String, required: true },
  stack: { type: String, default: '' },
  statusCode: { type: Number, default: 500 },
  requestId: { type: String, default: '' },
  route: { type: String, default: '' },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type ErrorLogDocument = InferSchemaType<typeof errorLogSchema>;
export const ErrorLogModel = model('ErrorLog', errorLogSchema);
