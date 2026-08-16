import { ROLES, type Role } from '@medcommerce/shared';
import bcrypt from 'bcrypt';

import { invalidateAccountStatusCache } from '../../middlewares/rbac.middleware';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';

import { actorTypeForRole } from './actor-context.util';
import { logoutAllSessions } from './auth.service';
import { RefreshTokenModel } from './models/refresh-token.model';
import { UserModel } from './models/user.model';

const BCRYPT_COST = 12;

/**
 * Prompt 24 Part 16 — Super Admin protection. `authorize(permission(RESOURCES.USERS, ACTIONS.UPDATE))`
 * at the route layer only proves the actor has *some* user-management
 * permission; it does NOT distinguish "can manage ordinary admins" from
 * "can manage/create/demote a super_admin account." Without this
 * second, service-layer check, any role granted `users:update` (a
 * plausible, non-super_admin real-world delegation — e.g. an
 * "inventory_manager" role someone later extends) could:
 *   - create a brand-new super_admin account,
 *   - promote an existing account (including itself) to super_admin,
 *   - suspend/deactivate/reset the password of an EXISTING super_admin,
 * none of which `authorize()` alone would catch, since RBAC in this
 * codebase is resource-scoped ("can touch `users`"), not tier-scoped
 * ("can touch accounts at or above their own privilege level"). This is
 * exactly the "Platform Admin must not escalate to Super Admin" rule.
 */
function assertCanAssignRole(actorRole: Role, targetRole: string): void {
  if (targetRole === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
    throw new ForbiddenError('Only a Super Admin can grant the Super Admin role');
  }
}

function assertCanManageTarget(actorId: string, actorRole: Role, target: { _id: unknown; role: string }): void {
  if (target.role === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
    throw new ForbiddenError('Only a Super Admin can manage another Super Admin account');
  }
  if (String(target._id) === actorId) {
    throw new ForbiddenError('You cannot modify your own admin account through this endpoint');
  }
}

/**
 * "Do not allow the system to leave the platform without a Super Admin.
 * Return a clear error message" — called before any change that would take
 * a currently-super_admin target OUT of usable super_admin standing (role
 * change away from super_admin, deactivation, or suspension). A no-op for
 * any target that isn't currently super_admin.
 *
 * Honest note on reachability: given `assertCanManageTarget`'s
 * self-modification block (a super_admin can never touch their OWN
 * account through this endpoint) PLUS the rule that only a super_admin may
 * act on another super_admin account, this check cannot actually fire as
 * "zero remaining" through the current endpoints — whoever is a valid
 * actor here is, by construction, itself another usable Super Admin the
 * moment target != actor. It is kept anyway as defense-in-depth: if either
 * of those two guards is ever relaxed or a future endpoint calls
 * `updateUserRoleOrStatus`/`suspendUser` through a different authorization
 * path, this is the one check that still holds the actual invariant Part
 * 10 asks for. See admin-user-role-management.integration.test.ts for the
 * tests proving both guards above are what does the real work today.
 */
async function assertNotLastSuperAdmin(target: { _id: unknown; role: string }): Promise<void> {
  if (target.role !== ROLES.SUPER_ADMIN) return;
  const otherUsableSuperAdmins = await UserModel.countDocuments({
    _id: { $ne: target._id },
    role: ROLES.SUPER_ADMIN,
    isActive: true,
    isSuspended: false,
    deletedAt: null,
  });
  if (otherUsableSuperAdmins === 0) {
    throw new UnprocessableEntityError(
      'Cannot remove, demote, or deactivate the only remaining Super Admin — promote another account to Super Admin first.',
    );
  }
}

function toPublicAdminUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended?: boolean;
  suspendedReason?: string;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isSuspended: user.isSuspended ?? false,
    suspendedReason: user.suspendedReason ?? '',
  };
}

interface CreateAdminUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
}

export async function createAdminUser(input: CreateAdminUserInput, actorId: string, actorRole: Role) {
  assertCanAssignRole(actorRole, input.role);

  const existing = await UserModel.findOne({ email: input.email });
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    createdBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'create',
    resource: 'admin_user',
    resourceId: String(user._id),
    after: { email: user.email, role: user.role },
  });

  return toPublicAdminUser(user);
}

export async function updateUserRoleOrStatus(
  id: string,
  patch: { role?: string; isActive?: boolean },
  actorId: string,
  actorRole: Role,
) {
  const before = await UserModel.findById(id).select('role isActive').lean();
  if (!before) throw new NotFoundError('User');

  assertCanManageTarget(actorId, actorRole, { _id: before._id, role: before.role });
  if (patch.role) assertCanAssignRole(actorRole, patch.role);

  const roleChangingAway = patch.role !== undefined && patch.role !== before.role;
  const deactivating = patch.isActive === false;
  if (roleChangingAway || deactivating) {
    await assertNotLastSuperAdmin({ _id: before._id, role: before.role });
  }

  const user = await UserModel.findByIdAndUpdate(
    id,
    { ...patch, updatedBy: actorId },
    { new: true },
  );
  if (!user) throw new NotFoundError('User');
  // Prompt 24 Part 63 — a role/active-status change must take effect on the
  // NEXT request from that user, not wait out their current access token's
  // TTL; see requireAuth (auth.middleware.ts) / getAccountStatus
  // (rbac.middleware.ts) for the read side of this cache.
  await invalidateAccountStatusCache(id);

  // "If a user's Admin role is removed, they must no longer retain
  // unauthorized Admin access... backend authorization must also change" —
  // requireAuth reads `role` from the JWT itself (not re-fetched from DB
  // per request; see auth.middleware.ts), so a live access token would
  // otherwise keep authorizing against the OLD role for up to its full TTL.
  // Forcing every refresh-token family to revoke here (same mechanism
  // `suspendUser` below already uses) means the affected user is signed out
  // everywhere and must re-authenticate to get a token carrying the new
  // role — the next login is guaranteed to see the correct sidebar/
  // permissions (Part 19), not just an eventual one.
  if (roleChangingAway) {
    await logoutAllSessions(String(user._id));
  }

  await recordAudit({
    actorId,
    actorType: actorTypeForRole(actorRole),
    action: 'update',
    resource: 'admin_user',
    resourceId: String(user._id),
    before: { role: before?.role, isActive: before?.isActive },
    after: { role: user.role, isActive: user.isActive },
  });

  return toPublicAdminUser(user);
}

/** Distinct from `isActive` (a plain admin toggle) — suspension is the Security Center's punitive lock, and revokes every live session immediately so it takes effect even mid-session. */
export async function suspendUser(id: string, reason: string, actorId: string, actorRole: Role) {
  const existing = await UserModel.findById(id).select('role').lean();
  if (!existing) throw new NotFoundError('User');
  assertCanManageTarget(actorId, actorRole, { _id: existing._id, role: existing.role });
  await assertNotLastSuperAdmin({ _id: existing._id, role: existing.role });

  const user = await UserModel.findByIdAndUpdate(
    id,
    { isSuspended: true, suspendedReason: reason, updatedBy: actorId },
    { new: true },
  );
  if (!user) throw new NotFoundError('User');

  await logoutAllSessions(String(user._id));
  // Prompt 24 Part 63 — see updateUserRoleOrStatus's comment above.
  await invalidateAccountStatusCache(id);

  await recordAudit({
    actorId,
    actorType: actorTypeForRole(actorRole),
    action: 'update',
    resource: 'admin_user',
    resourceId: String(user._id),
    after: { isSuspended: true, suspendedReason: reason },
  });

  return toPublicAdminUser(user);
}

export async function unsuspendUser(id: string, actorId: string, actorRole: Role) {
  const existing = await UserModel.findById(id).select('role').lean();
  if (!existing) throw new NotFoundError('User');
  assertCanManageTarget(actorId, actorRole, { _id: existing._id, role: existing.role });

  const user = await UserModel.findByIdAndUpdate(
    id,
    { isSuspended: false, suspendedReason: '', updatedBy: actorId },
    { new: true },
  );
  if (!user) throw new NotFoundError('User');
  await invalidateAccountStatusCache(id);

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'admin_user',
    resourceId: String(user._id),
    after: { isSuspended: false },
  });

  return toPublicAdminUser(user);
}

/** Admin-initiated reset — distinct from the self-service forgot-password flow (auth.service.ts requestPasswordReset), for when an admin needs to set another admin's password directly (e.g. account recovery). Revokes all of that user's existing sessions since the old password/tokens are no longer trusted. */
export async function resetUserPassword(id: string, newPassword: string, actorId: string, actorRole: Role) {
  const user = await UserModel.findById(id);
  if (!user) throw new NotFoundError('User');
  assertCanManageTarget(actorId, actorRole, { _id: user._id, role: user.role });

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.set('updatedBy', actorId);
  await user.save();

  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() },
  );

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'admin_user',
    resourceId: String(user._id),
    after: { passwordReset: true },
  });

  return { reset: true };
}

export function listUsers(query: ListQuery) {
  const filter = { ...query.filter, deletedAt: null };
  return UserModel.find(filter)
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
}

export async function getUserById(id: string) {
  const user = await UserModel.findById(id).select('-passwordHash').lean();
  if (!user) throw new NotFoundError('User');
  return user;
}
