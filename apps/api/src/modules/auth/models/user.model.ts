import { DEFAULT_ROLES, ROLES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Optional — no phone-based registration/verification flow exists yet ( 10
    // scope is auth, not customer-profile management). Present only so the
    // config-driven OTP channel (sms/whatsapp) has somewhere real to send to;
    // when unset, OTP delivery falls back to email regardless of the configured channel.
    phone: { type: String, default: null, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: DEFAULT_ROLES, default: ROLES.CUSTOMER, index: true },
    isActive: { type: Boolean, default: true },
    // Admin "Continue with Google" ( 10) — the Google `sub` claim only,
    // never tokens. No `default` — Mongoose then leaves the field entirely
    // absent (not `null`) when unset, so the sparse unique index actually
    // excludes non-linked users instead of colliding on `googleId: null`
    // for every one of them (see migrate-google-id-null.ts for the backfill
    // this required on already-existing documents). Linking never creates a
    // new account or changes `role` — see google-auth.service.ts's
    // account-linking policy.
    googleId: { type: String, unique: true, sparse: true, index: true },
    googleLinkedAt: { type: Date, default: null },
    // Distinct from isActive (an admin toggle) — set when Security Center locks
    // an account for a policy violation, with a reason kept for the audit trail.
    isSuspended: { type: Boolean, default: false },
    suspendedReason: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
    // Account-lockout (Security Center: "Maximum Login Attempts") — reset to 0
    // on every successful login, incremented on every failed one.
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ deletedAt: 1 });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const UserModel = model('User', userSchema);
