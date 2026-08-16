import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Refresh tokens are stored hashed, never in plaintext, and support rotation-on-use:
 * `replacedByTokenHash` links the chain so reuse of a revoked token can be detected
 * and the entire session family revoked (theft response).
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    deviceInfo: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
