import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Records every login attempt, success or failure — distinct from RefreshToken
 * (which only exists for successful logins) and needed for security review /
 * brute-force pattern detection. Append-only; retained 180 days via TTL.
 */
const loginHistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  success: { type: Boolean, required: true },
  reason: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

loginHistorySchema.index({ userId: 1, createdAt: -1 });
loginHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export type LoginHistoryDocument = InferSchemaType<typeof loginHistorySchema>;
export const LoginHistoryModel = model('LoginHistory', loginHistorySchema);
