import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const customerAddressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, default: 'Home' },
  type: { type: String, enum: ['shipping', 'billing', 'both'], default: 'both' },
  line1: { type: String, required: true },
  line2: { type: String, default: '' },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: 'India' },
  phone: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  // ---- Prompt 31 — address verification state ----
  // Both default false on every new address (never auto-true even when
  // `mobileVerificationEnabled`/`pincodeValidationEnabled` are off — see
  // address.service.ts, which only READS these gated by config; a config
  // toggle never retroactively rewrites past verification state). Cleared
  // back to false whenever the corresponding field is edited (`phone` ->
  // mobileVerified, `pincode` -> pincodeVerified) so a stale verification
  // can never silently carry over to a changed value (Part 24).
  mobileVerified: { type: Boolean, default: false },
  pincodeVerified: { type: Boolean, default: false },
});

customerAddressSchema.index({ userId: 1, isDefault: 1 });

/**
 * Prompt 31 Part 24 — enforced HERE (query middleware), not only in
 * address.service.ts, so the invariant holds regardless of entry point
 * (mirrors notification-template.model.ts's identical
 * pre('findOneAndUpdate') pattern): editing `phone` always clears
 * `mobileVerified` and editing `pincode` always clears `pincodeVerified`,
 * UNLESS the same update is the one explicitly setting that verified flag
 * (only address-mobile-verification.service.ts's confirm step and
 * address.service.ts's pincode-validation write ever do that in the same
 * call as the field itself changing).
 */
customerAddressSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as Record<string, unknown> & { $set?: Record<string, unknown> };
  const patch = { ...update, ...(update?.$set ?? {}) };
  if (patch.phone !== undefined && patch.mobileVerified === undefined) {
    this.set({ mobileVerified: false });
  }
  if (patch.pincode !== undefined && patch.pincodeVerified === undefined) {
    this.set({ pincodeVerified: false });
  }
  next();
});

auditPlugin(customerAddressSchema);

export type CustomerAddressDocument = InferSchemaType<typeof customerAddressSchema>;
export const CustomerAddressModel = model('CustomerAddress', customerAddressSchema);
