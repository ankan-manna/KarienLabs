import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Unifies OTP / password-reset / email-verification — all three are the same
 * shape ("prove access to a contact point, within a TTL, with limited attempts")
 * and only differ by `purpose`, so one collection avoids three near-duplicate schemas.
 */
export const VERIFICATION_PURPOSES = {
  LOGIN_OTP: 'login_otp',
  PASSWORD_RESET: 'password_reset', // link-based (existing) flow — unchanged
  // Distinct purpose from PASSWORD_RESET above so a code generated for the new
  // OTP-based reset flow (Prompt 10, config-gated by
  // authentication.otp.passwordReset.enabled) can never be replayed against
  // the older emailed-link flow or vice versa.
  PASSWORD_RESET_OTP: 'password_reset_otp',
  EMAIL_VERIFICATION: 'email_verification',
  PHONE_VERIFICATION: 'phone_verification',
  // Prompt 31 — gates account creation itself (register() withholds real
  // session tokens until this is consumed). Distinct from EMAIL_VERIFICATION
  // above (the older, unenforced link-based flow, left untouched) and from
  // LOGIN_OTP (issued only after an account already exists/is verified).
  REGISTRATION_OTP: 'registration_otp',
  // Prompt 31 — verifies a per-ADDRESS contact number, not the account-level
  // phone (see profile.service.ts's PHONE_VERIFICATION, which is scoped to
  // (userId, purpose) and would otherwise collide/invalidate concurrently
  // with an in-flight address verification for the same user).
  ADDRESS_MOBILE_VERIFICATION: 'address_mobile_verification',
  // Prompt 32 — the first purpose with no User document at all: a guest
  // distributor verifying contact ownership before submitting a bulk-purchase
  // enquiry. Scoped by (contact, purpose) via `userId: null` — see
  // otp.service.ts's guest-mode branch.
  DISTRIBUTOR_ENQUIRY_VERIFICATION: 'distributor_enquiry_verification',
} as const;

export const OTP_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
} as const;

const verificationTokenSchema = new Schema({
  // Prompt 32 — relaxed from `required: true` to support guest (no User
  // document) verification: `null` means this record is scoped by `contact`
  // instead (see the `{contact, purpose}` index below and otp.service.ts's
  // guest-mode branch). Every PRE-EXISTING purpose still always sets a real
  // userId — this only widens what's ALLOWED, it changes no current caller.
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  purpose: { type: String, enum: Object.values(VERIFICATION_PURPOSES), required: true },
  tokenHash: { type: String, required: true },
  contact: { type: String, required: true }, // email or phone the token was sent to
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  consumedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  // OTP-lifecycle fields (Prompt 10). Left unset/defaulted for the pre-existing
  // link-based purposes (PASSWORD_RESET, EMAIL_VERIFICATION) — only
  // LOGIN_OTP/PASSWORD_RESET_OTP/PHONE_VERIFICATION populate them.
  channel: { type: String, enum: Object.values(OTP_CHANNELS), default: OTP_CHANNELS.EMAIL },
  resendCount: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
});

verificationTokenSchema.index({ userId: 1, purpose: 1 });
// Prompt 32 — the guest-mode lookup path: every guest record has
// `userId: null`, so `{userId:1, purpose:1}` alone would match every guest
// verification for a purpose regardless of WHICH contact — this compound
// index is what otp.service.ts's guest branch actually queries against.
verificationTokenSchema.index({ contact: 1, purpose: 1 });
verificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type VerificationTokenDocument = InferSchemaType<typeof verificationTokenSchema>;
export const VerificationTokenModel = model('VerificationToken', verificationTokenSchema);
