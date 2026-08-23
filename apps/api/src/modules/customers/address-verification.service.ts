import { CUSTOMER_AUDIT_ACTIONS, NOTIFICATION_CHANNELS } from '@medcommerce/shared';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { maskContact } from '../auth/contact.util';
import { VERIFICATION_PURPOSES, VerificationTokenModel } from '../auth/models/verification-token.model';
import { issueOtp, verifyOtp } from '../auth/otp.service';

import { getAddressVerificationConfig } from './address-verification-config.service';
import { CustomerAddressModel } from './models/customer-address.model';
import { lookupPincode } from '../../integrations/postal-pincode/postal-pincode.client';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

async function loadOwnedAddress(userId: string, addressId: string) {
  const address = await CustomerAddressModel.findOne({ _id: addressId, userId, deletedAt: null });
  if (!address) throw new NotFoundError('Address');
  return address;
}

/**
 * Part 2/23 — verifies THIS address's own phone number, distinct
 * from the account-level `PHONE_VERIFICATION` purpose (profile.service.ts) —
 * a customer can have multiple addresses with different contact numbers
 * (e.g. a relative's number for a gift-shipping address), each verified
 * independently. Resumable like `register()`: calling this again while an
 * unexpired OTP is still outstanding re-sends (cooldown-limited) rather than
 * erroring.
 */
export async function requestAddressMobileOtp(userId: string, addressId: string, meta: RequestMeta) {
  const address = await loadOwnedAddress(userId, addressId);
  if (address.mobileVerified) {
    throw new UnprocessableEntityError('This address phone number is already verified.');
  }

  const hasActiveOtp = await VerificationTokenModel.exists({
    userId,
    purpose: VERIFICATION_PURPOSES.ADDRESS_MOBILE_VERIFICATION,
    contact: address.phone,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });

  const otp = await issueOtp({
    userId,
    purpose: VERIFICATION_PURPOSES.ADDRESS_MOBILE_VERIFICATION,
    contact: address.phone,
    channelOverride: NOTIFICATION_CHANNELS.SMS,
    isResend: Boolean(hasActiveOtp),
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  return {
    maskedContact: maskContact(address.phone),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

export async function confirmAddressMobileOtp(
  userId: string,
  addressId: string,
  code: string,
  meta: RequestMeta,
) {
  const address = await loadOwnedAddress(userId, addressId);

  const record = await verifyOtp({
    userId,
    purpose: VERIFICATION_PURPOSES.ADDRESS_MOBILE_VERIFICATION,
    code,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  // Guards the race where the address's phone was edited (clearing
  // mobileVerified via the model's pre-hook) or a different address's
  // verification was in flight between request and confirm — the OTP's own
  // `(userId, purpose)` scope has no addressId, only the contact it was
  // actually sent to.
  if (record.contact !== address.phone) {
    throw new UnprocessableEntityError(
      'This code was issued for a different phone number. Please request a new code.',
    );
  }

  await CustomerAddressModel.updateOne(
    { _id: address._id },
    { mobileVerified: true, updatedBy: userId },
  );

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.ADDRESS_MOBILE_VERIFIED,
    resource: 'customer_address',
    resourceId: String(address._id),
  });

  return { verified: true };
}

export interface PincodeValidationResult {
  verified: boolean;
  district: string | null;
  state: string | null;
}

/**
 * Part 3 — cross-checks a submitted pincode against India Post's
 * directory and, when the address form provides one, against the submitted
 * `state`. Fail-OPEN at this layer when `pincodeValidationEnabled` is off OR
 * the third-party API is unreachable (`unknown`/`unreachable`) — a flaky
 * public API must never block a customer from saving a legitimately correct
 * address; the SEPARATE, mandatory, fail-CLOSED Shiprocket serviceability
 * gate (shiprocket-fulfillment.service.ts's
 * `checkServiceabilityForCheckout`) is what actually blocks checkout, not
 * this. Only a DEFINITIVE "no such pincode" answer rejects here.
 */
export async function validatePincodeForAddress(
  pincode: string,
  state: string,
): Promise<PincodeValidationResult> {
  const cfg = await getAddressVerificationConfig();
  if (!cfg.pincodeValidationEnabled) return { verified: false, district: null, state: null };

  const result = await lookupPincode(pincode);

  if (result.outcome === 'invalid') {
    throw new UnprocessableEntityError('This pincode does not exist. Please check and try again.');
  }
  if (result.outcome !== 'valid') {
    // unknown/unreachable — cannot confirm either way; save unverified.
    return { verified: false, district: null, state: null };
  }

  const normalize = (s: string) => s.trim().toLowerCase();
  if (normalize(result.state) !== normalize(state)) {
    throw new UnprocessableEntityError(
      `This pincode belongs to ${result.state}, not ${state}. Please check the state or pincode.`,
    );
  }

  return { verified: true, district: result.district, state: result.state };
}
