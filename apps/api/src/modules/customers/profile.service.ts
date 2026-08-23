import { CUSTOMER_AUDIT_ACTIONS, NOTIFICATION_CHANNELS } from '@medcommerce/shared';
import bcrypt from 'bcrypt';

import { invalidateAccountStatusCache } from '../../middlewares/rbac.middleware';
import { NotFoundError, UnauthenticatedError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { logoutAllSessions } from '../auth/auth.service';
import { UserModel } from '../auth/models/user.model';
import { VERIFICATION_PURPOSES } from '../auth/models/verification-token.model';
import { issueOtp, verifyOtp, type IssueOtpResult } from '../auth/otp.service';

import { CustomerProfileModel } from './models/customer-profile.model';

export async function getOrCreateProfile(userId: string) {
  const profile = await CustomerProfileModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  ).lean();
  return profile;
}

export async function updateProfile(userId: string, patch: Record<string, unknown>) {
  const updated = await CustomerProfileModel.findOneAndUpdate(
    { userId },
    { ...patch, updatedBy: userId },
    { upsert: true, new: true, runValidators: true },
  ).lean();

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.PROFILE_UPDATED,
    resource: 'customer_profile',
    resourceId: userId,
    after: patch,
  });

  return updated;
}

interface OtpRequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  role?: 'customer';
}

/**
 * Part 3 — security-sensitive identifier change flow, reusing
 * the EXISTING OTP system (`VERIFICATION_PURPOSES.PHONE_VERIFICATION`,
 * defined but never wired to anything until now — see
 * otp.service.ts's OtpPurpose widening). `phone` is deliberately NOT part
 * of the generic `updateProfile` patch schema (profile.validator.ts) — the
 * ONLY way to change it is through this two-step verify flow, so a blind
 * PATCH can never silently swap a customer's contact number.
 */
export async function requestPhoneChange(
  userId: string,
  newPhone: string,
  meta: OtpRequestMeta = {},
): Promise<IssueOtpResult> {
  const profile = await getOrCreateProfile(userId);
  if (profile?.phone === newPhone) {
    throw new UnprocessableEntityError('This is already your phone number on file');
  }

  const result = await issueOtp({
    userId,
    purpose: VERIFICATION_PURPOSES.PHONE_VERIFICATION,
    contact: newPhone,
    channelOverride: NOTIFICATION_CHANNELS.SMS,
    ...meta,
  });

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.PHONE_CHANGE_REQUESTED,
    resource: 'customer_profile',
    resourceId: userId,
  });

  return result;
}

export async function confirmPhoneChange(userId: string, code: string, meta: OtpRequestMeta = {}) {
  const record = await verifyOtp({
    userId,
    purpose: VERIFICATION_PURPOSES.PHONE_VERIFICATION,
    code,
    ...meta,
  });

  const updated = await CustomerProfileModel.findOneAndUpdate(
    { userId },
    { phone: record.contact, updatedBy: userId },
    { upsert: true, new: true },
  ).lean();

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.PHONE_CHANGED,
    resource: 'customer_profile',
    resourceId: userId,
    after: { phone: record.contact },
  });

  return updated;
}

/**
 * Part 35 — a SAFE, reversible-by-admin self-deactivation, never
 * a hard delete. Uses the User model's PRE-EXISTING `isActive` field
 * (already checked by every login path — see auth.service.ts — but never
 * previously writable by the customer themselves; only admin suspension
 * via `isSuspended` was wired). Orders/invoices/payments/refunds/audit
 * records are completely untouched — nothing here removes or anonymizes
 * any historical business data, matching the explicit "do not blindly
 * hard-delete records required for legal/tax/audit retention" instruction.
 * Requires the current password (not just an active session) as
 * confirmation for an otherwise-irreversible-feeling action, and revokes
 * every active session so a deactivated account can't keep transacting
 * from an already-issued access token until it naturally expires.
 */
export async function deactivateAccount(userId: string, password: string, reason?: string): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthenticatedError('Current password is incorrect');

  user.isActive = false;
  await user.save();

  await logoutAllSessions(userId);
  // Part 63 — see requireAuth (auth.middleware.ts)'s comment: this
  // is what actually makes the "can't keep transacting on an already-issued
  // access token" claim above true, not just the refresh-token revocation.
  await invalidateAccountStatusCache(userId);

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.ACCOUNT_DEACTIVATED,
    resource: 'user',
    resourceId: userId,
    metadata: reason ? { reason } : undefined,
  });
}
