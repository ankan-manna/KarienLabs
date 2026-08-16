import { ACTIONS, RESOURCES, ROLES, type Role } from '@medcommerce/shared';

import { invalidateUserPermissionCache } from '../../middlewares/rbac.middleware';
import { ForbiddenError, ValidationError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';

import { UserPermissionModel } from './models/user-permission.model';

/**
 * Prompt 24 Part 15/16/64 — per-user permission overrides (the finest-grained
 * escalation surface in this codebase: a GRANT override adds a permission
 * a user's ROLE doesn't otherwise carry). This was previously implemented
 * directly in the controller with:
 *   - no audit trail at all (Part 64 requires security-sensitive admin
 *     actions to go through AuditService),
 *   - no validation that `permissionKey` is even a real, known permission,
 *   - no protection against an actor granting themselves a permission,
 *   - no protection against a non-Super-Admin granting/revoking access to
 *     the most sensitive resources (roles/users/configuration/audit_logs) —
 *     which chains directly into the admin_user.service.ts/role.service.ts
 *     escalation vectors those files now guard against; this closes the
 *     SAME hole at the per-user-override layer.
 */

const VALID_RESOURCES = new Set<string>(Object.values(RESOURCES));
const VALID_ACTIONS = new Set<string>(Object.values(ACTIONS));

/** Resources sensitive enough that only a Super Admin may grant/revoke a permission on them for another user — mirrors the same tier boundary enforced in admin-user.service.ts / role.service.ts. */
const SENSITIVE_RESOURCES = new Set<string>([
  RESOURCES.ROLES,
  RESOURCES.USERS,
  RESOURCES.CONFIGURATION,
  RESOURCES.AUDIT_LOGS,
]);

function assertValidPermissionKey(permissionKey: string): void {
  const [resource, action] = permissionKey.split(':');
  if (!resource || !action || !VALID_RESOURCES.has(resource) || !VALID_ACTIONS.has(action)) {
    throw new ValidationError(`"${permissionKey}" is not a recognized permission`);
  }
}

function assertGrantAllowed(actorId: string, actorRole: Role, targetUserId: string, permissionKey: string): void {
  if (targetUserId === actorId) {
    throw new ForbiddenError('You cannot modify your own permission overrides');
  }
  const [resource] = permissionKey.split(':');
  if (SENSITIVE_RESOURCES.has(resource) && actorRole !== ROLES.SUPER_ADMIN) {
    throw new ForbiddenError(`Only a Super Admin can grant or revoke a "${resource}" permission`);
  }
}

export async function grantUserPermission(
  targetUserId: string,
  input: { permissionKey: string; effect: string; reason?: string; expiresAt?: Date | null },
  actorId: string,
  actorRole: Role,
) {
  assertValidPermissionKey(input.permissionKey);
  assertGrantAllowed(actorId, actorRole, targetUserId, input.permissionKey);

  const override = await UserPermissionModel.findOneAndUpdate(
    { userId: targetUserId, permissionKey: input.permissionKey },
    {
      effect: input.effect,
      reason: input.reason ?? '',
      expiresAt: input.expiresAt ?? null,
      createdBy: actorId,
    },
    { upsert: true, new: true },
  );
  await invalidateUserPermissionCache(targetUserId);

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'user_permission',
    resourceId: targetUserId,
    after: { permissionKey: input.permissionKey, effect: input.effect, reason: input.reason ?? '' },
  });

  return override;
}

export async function revokeUserPermission(
  targetUserId: string,
  permissionKey: string,
  actorId: string,
  actorRole: Role,
) {
  assertGrantAllowed(actorId, actorRole, targetUserId, permissionKey);

  // Idempotent delete (matches the pre-existing behavior this replaces) —
  // calling revoke on an override that's already gone is a no-op success,
  // not an error; still audited only when something actually changed.
  const existing = await UserPermissionModel.findOne({ userId: targetUserId, permissionKey }).lean();
  await UserPermissionModel.deleteOne({ userId: targetUserId, permissionKey });
  await invalidateUserPermissionCache(targetUserId);

  if (existing) {
    await recordAudit({
      actorId,
      action: 'delete',
      resource: 'user_permission',
      resourceId: targetUserId,
      before: { permissionKey, effect: existing.effect },
    });
  }

  return { revoked: true };
}

export function listUserPermissions(targetUserId: string) {
  return UserPermissionModel.find({ userId: targetUserId }).lean();
}
