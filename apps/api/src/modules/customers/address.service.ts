import { CUSTOMER_AUDIT_ACTIONS } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { NotFoundError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';

import { validatePincodeForAddress } from './address-verification.service';
import { CustomerAddressModel } from './models/customer-address.model';

/**
 * Prompt 31 Part 3/24 — runs pincode validation whenever `pincode` is part
 * of the write, using `state` from the same input if given, else the
 * existing address's state (an update that only changes `pincode` still
 * needs a state to cross-check against). Mutates `input` in place with the
 * resolved `pincodeVerified` — never trusts a client-submitted
 * `pincodeVerified` (the create/update validators don't even accept that
 * field, so `input` never has one to begin with).
 */
async function applyPincodeValidation(
  input: Record<string, unknown>,
  existingState?: string,
): Promise<void> {
  if (typeof input.pincode !== 'string') return;
  const state = typeof input.state === 'string' ? input.state : existingState;
  if (!state) return;

  const result = await validatePincodeForAddress(input.pincode, state);
  input.pincodeVerified = result.verified;
}

export function listMyAddresses(userId: string) {
  return CustomerAddressModel.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
}

/**
 * Prompt 21 Part 7/60 — atomic default-address transition. The previous
 * implementation ran `clearDefault()` (an `updateMany`) and the create/
 * update as TWO SEPARATE, non-transactional writes — two concurrent
 * "set as default" requests for the same customer could interleave and
 * leave either zero or two addresses marked default. Wrapping both writes
 * in one Mongo transaction makes the whole "clear old default + set new
 * default" operation atomic — a concurrent request either sees the
 * fully-applied result or waits, never a half-applied state.
 */
async function clearDefaultInSession(userId: string, session: mongoose.ClientSession): Promise<void> {
  await CustomerAddressModel.updateMany({ userId, isDefault: true }, { isDefault: false }, { session });
}

export async function createAddress(userId: string, input: Record<string, unknown>) {
  await applyPincodeValidation(input);

  const session = await mongoose.startSession();
  let created;
  try {
    created = await session.withTransaction(async () => {
      if (input.isDefault) await clearDefaultInSession(userId, session);
      const [doc] = await CustomerAddressModel.create([{ ...input, userId, createdBy: userId }], { session });
      return doc;
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.ADDRESS_CREATED,
    resource: 'customer_address',
    resourceId: String(created!._id),
    after: created,
  });

  return created;
}

export async function updateAddress(userId: string, id: string, input: Record<string, unknown>) {
  if (typeof input.pincode === 'string' && typeof input.state !== 'string') {
    const existing = await CustomerAddressModel.findOne({ _id: id, userId }).select('state').lean();
    if (!existing) throw new NotFoundError('Address');
    await applyPincodeValidation(input, existing.state);
  } else {
    await applyPincodeValidation(input);
  }

  const session = await mongoose.startSession();
  let updated;
  try {
    updated = await session.withTransaction(async () => {
      if (input.isDefault) await clearDefaultInSession(userId, session);
      const doc = await CustomerAddressModel.findOneAndUpdate(
        { _id: id, userId },
        { ...input, updatedBy: userId },
        { new: true, runValidators: true, session },
      );
      if (!doc) throw new NotFoundError('Address');
      return doc;
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.ADDRESS_UPDATED,
    resource: 'customer_address',
    resourceId: id,
    after: updated,
  });
  if (input.isDefault === true) {
    await recordAudit({
      actorId: userId,
      action: CUSTOMER_AUDIT_ACTIONS.DEFAULT_ADDRESS_CHANGED,
      resource: 'customer_address',
      resourceId: id,
    });
  }

  return updated;
}

/**
 * Part 5/7 — dedicated set/unset-default action, atomic for the same
 * reason as create/updateAddress above. Setting `isDefault: true` clears
 * every other address first; `isDefault: false` just unsets this one (a
 * customer is allowed to have zero default addresses).
 */
export async function setDefaultAddress(userId: string, id: string, isDefault: boolean) {
  const session = await mongoose.startSession();
  let updated;
  try {
    updated = await session.withTransaction(async () => {
      if (isDefault) await clearDefaultInSession(userId, session);
      const doc = await CustomerAddressModel.findOneAndUpdate(
        { _id: id, userId },
        { isDefault, updatedBy: userId },
        { new: true, session },
      );
      if (!doc) throw new NotFoundError('Address');
      return doc;
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.DEFAULT_ADDRESS_CHANGED,
    resource: 'customer_address',
    resourceId: id,
    after: { isDefault },
  });

  return updated;
}

export async function deleteAddress(userId: string, id: string) {
  const result = await CustomerAddressModel.updateOne(
    { _id: id, userId, deletedAt: null },
    { deletedAt: new Date(), deletedBy: userId },
  );
  if (result.matchedCount === 0) throw new NotFoundError('Address');

  await recordAudit({
    actorId: userId,
    action: CUSTOMER_AUDIT_ACTIONS.ADDRESS_DELETED,
    resource: 'customer_address',
    resourceId: id,
  });
}
