import { createHash } from 'crypto';

import { invalidateFeatureFlagCache } from '../../middlewares/feature-flag.middleware';
import { ConflictError, NotFoundError } from '../../utils/app-error';
import { FeatureFlagModel } from '../auth/models/feature-flag.model';

export function listFeatureFlags() {
  return FeatureFlagModel.find().sort({ key: 1 }).lean();
}

/** Deterministic per-subject bucketing so the same user/session consistently lands on the same side of a partial rollout instead of flapping between requests. */
function isInRollout(key: string, subjectId: string, rolloutPercentage: number): boolean {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0) return false;
  const hash = createHash('sha1').update(`${key}:${subjectId}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < rolloutPercentage;
}

export interface FlagEvaluationContext {
  role?: string;
  userId?: string;
}

/**
 * Public, unauthenticated-safe shape — just the enabled flags applicable to
 * the caller, not the full admin record. Evaluates all three scopes (global
 * always applies; role/user scopes only apply when the caller's context
 * matches a flag's `targetRoles`/`targetUserIds`), then applies the rollout
 * percentage as a deterministic per-subject bucket so a partial rollout is
 * stable across requests instead of being decided per-call.
 */
export async function getActiveFlags(
  ctx: FlagEvaluationContext = {},
): Promise<Record<string, boolean>> {
  const or: Record<string, unknown>[] = [{ scope: 'global' }];
  if (ctx.role) or.push({ scope: 'role', targetRoles: ctx.role });
  if (ctx.userId) or.push({ scope: 'user', targetUserIds: ctx.userId });

  const flags = await FeatureFlagModel.find({ enabled: true, $or: or })
    .select('key rolloutPercentage')
    .lean();

  const subjectId = ctx.userId ?? 'anonymous';
  return Object.fromEntries(
    flags
      .filter((flag) => isInRollout(flag.key, subjectId, flag.rolloutPercentage))
      .map((flag) => [flag.key, true]),
  );
}

export async function createFeatureFlag(input: Record<string, unknown>, actorId: string) {
  const key = String(input.key);
  if (await FeatureFlagModel.findOne({ key }))
    throw new ConflictError(`Feature flag "${key}" already exists`);
  return FeatureFlagModel.create({ ...input, updatedBy: actorId });
}

export async function updateFeatureFlag(
  key: string,
  patch: Record<string, unknown>,
  actorId: string,
) {
  const flag = await FeatureFlagModel.findOneAndUpdate(
    { key },
    { ...patch, updatedBy: actorId },
    { new: true },
  );
  if (!flag) throw new NotFoundError('Feature flag');
  await invalidateFeatureFlagCache(key);
  return flag;
}

export async function setFeatureFlagEnabled(key: string, enabled: boolean, actorId: string) {
  return updateFeatureFlag(key, { enabled }, actorId);
}

export async function deleteFeatureFlag(key: string) {
  const result = await FeatureFlagModel.deleteOne({ key });
  if (result.deletedCount === 0) throw new NotFoundError('Feature flag');
  await invalidateFeatureFlagCache(key);
}
