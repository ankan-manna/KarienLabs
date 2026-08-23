import type { Permission } from '@medcommerce/shared';
import { PERMISSION_EFFECTS } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { redis } from '../config/redis';
import { RoleModel } from '../modules/auth/models/role.model';
import { UserPermissionModel } from '../modules/auth/models/user-permission.model';
import { UserModel } from '../modules/auth/models/user.model';
import { ForbiddenError, UnauthenticatedError } from '../utils/app-error';

const CACHE_TTL_SECONDS = 60;

async function getRolePermissions(roleKey: string): Promise<string[]> {
  const cacheKey = `role-permissions:${roleKey}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const role = await RoleModel.findOne({ key: roleKey, deletedAt: null }).lean();
  const permissions = role?.permissions ?? [];
  await redis.set(cacheKey, JSON.stringify(permissions), 'EX', CACHE_TTL_SECONDS);
  return permissions;
}

async function getUserPermissionOverrides(
  userId: string,
): Promise<{ granted: string[]; denied: string[] }> {
  const cacheKey = `user-permission-overrides:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const overrides = await UserPermissionModel.find({
    userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  const result = {
    granted: overrides
      .filter((o) => o.effect === PERMISSION_EFFECTS.GRANT)
      .map((o) => o.permissionKey),
    denied: overrides
      .filter((o) => o.effect === PERMISSION_EFFECTS.DENY)
      .map((o) => o.permissionKey),
  };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  return result;
}

/** Call after any Role/RolePermission write. */
export async function invalidateRolePermissionsCache(roleKey: string): Promise<void> {
  await redis.del(`role-permissions:${roleKey}`);
}

/** Call after any UserPermission write for that user. */
export async function invalidateUserPermissionCache(userId: string): Promise<void> {
  await redis.del(`user-permission-overrides:${userId}`);
}

interface AccountStatus {
  isActive: boolean;
  isSuspended: boolean;
  deletedAt: string | null;
}

/**
 * Part 63 — "if an admin's permissions change, ensure previously
 * issued tokens cannot bypass the updated authorization model." Permission
 * CHANGES already satisfy this (`getEffectivePermissions` above re-reads the
 * role's current permission set from this same Redis cache on every
 * `authorize()`-gated request, never from the JWT). The gap this closes is
 * narrower but real: `requireAuth` (auth.middleware.ts) previously trusted
 * the JWT's embedded `{ sub, role }` for its full 15-minute life with NO
 * check of the account's CURRENT active/suspended state — a suspended or
 * deactivated admin/customer could keep using an already-issued access
 * token for up to 15 more minutes after being suspended, even though their
 * refresh tokens are correctly revoked immediately
 * (admin-user.service.ts::suspendUser calls logoutAllSessions). Cached with
 * the SAME TTL/invalidation pattern as the permission caches above, so this
 * adds one more cheap Redis read per authenticated request rather than a
 * fresh DB hit every time.
 */
async function getAccountStatus(userId: string): Promise<AccountStatus> {
  const cacheKey = `account-status:${userId}`;
  // Part 75 — a Redis outage must not become a total authentication outage.
  // `rate-limit-redis` already makes Redis a hard dependency for every
  // `/api/v1` request today via `globalRateLimiter`, but this check is
  // ADDITIONAL and security-critical (not merely a rate-limit), so it's
  // deliberately made independently resilient: a Redis read/write failure
  // here falls through to MongoDB (the more fundamental dependency) rather
  // than rejecting every authenticated request in the whole app.
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through to a direct DB read below
  }

  const user = await UserModel.findById(userId).select('isActive isSuspended deletedAt').lean();
  const status: AccountStatus = {
    isActive: user?.isActive ?? false,
    isSuspended: user?.isSuspended ?? false,
    deletedAt: user?.deletedAt ? user.deletedAt.toISOString() : null,
  };
  await redis.set(cacheKey, JSON.stringify(status), 'EX', CACHE_TTL_SECONDS).catch(() => undefined);
  return status;
}

/** Call after any write that changes a user's isActive/isSuspended/deletedAt state (suspend, unsuspend, deactivate, soft-delete, role change). */
export async function invalidateAccountStatusCache(userId: string): Promise<void> {
  await redis.del(`account-status:${userId}`);
}

/** Returns `false` (reject) if the account is inactive, suspended, or soft-deleted; `true` otherwise. Used by `requireAuth` — see the comment above `getAccountStatus`. */
export async function isAccountUsable(userId: string): Promise<boolean> {
  const status = await getAccountStatus(userId);
  return status.isActive && !status.isSuspended && !status.deletedAt;
}

export async function getEffectivePermissions(
  userId: string,
  roleKey: string,
): Promise<Set<string>> {
  const [rolePermissions, overrides] = await Promise.all([
    getRolePermissions(roleKey),
    getUserPermissionOverrides(userId),
  ]);

  const effective = new Set([...rolePermissions, ...overrides.granted]);
  for (const denied of overrides.denied) effective.delete(denied);
  return effective;
}

/**
 * Route-level permission gate. Effective permissions = role permissions (cached,
 * not embedded in the JWT so revocation takes effect without re-login) plus/minus
 * per-user UserPermission overrides — deny always wins over an inherited grant.
 */
export function authorize(...required: Permission[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthenticatedError());

    // super_admin implicitly bypasses granular checks (deny overrides still apply via
    // getEffectivePermissions if ever called directly for a super_admin elsewhere).
    if (req.user.role === 'super_admin') return next();

    const effective = await getEffectivePermissions(req.user.id, req.user.role);
    const hasAll = required.every((perm) => effective.has(perm));

    if (!hasAll) {
      return next(new ForbiddenError(`Missing required permission: ${required.join(', ')}`));
    }

    next();
  };
}
