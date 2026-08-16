import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * IP addresses blocked from reaching the platform entirely — enforced by
 * `blocked-ip.middleware.ts` (Redis-cached, see that file) ahead of every
 * `/api/v1/*` route. Distinct from account lockout (per-user, in User model)
 * and from rate limiting (temporary, not an explicit admin decision).
 */
const blockedIpSchema = new Schema(
  {
    ipAddress: { type: String, required: true, unique: true, trim: true },
    reason: { type: String, default: '' },
    blockedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type BlockedIpDocument = InferSchemaType<typeof blockedIpSchema>;
export const BlockedIpModel = model('BlockedIp', blockedIpSchema);
