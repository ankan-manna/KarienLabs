import { ROLES, type Role } from '@medcommerce/shared';

import { invalidateRolePermissionsCache } from '../../middlewares/rbac.middleware';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';

import { RoleModel } from './models/role.model';

export function listRoles() {
  return RoleModel.find().sort({ key: 1 }).lean();
}

export async function getRoleByKey(key: string) {
  const role = await RoleModel.findOne({ key }).lean();
  if (!role) throw new NotFoundError('Role');
  return role;
}

export async function createRole(
  input: { key: string; name: string; permissions?: string[] },
  actorId: string,
) {
  const key = input.key.toLowerCase();
  if (await RoleModel.findOne({ key })) throw new ConflictError(`Role "${key}" already exists`);
  const role = await RoleModel.create({ ...input, key, isSystem: false, createdBy: actorId });
  await recordAudit({
    actorId,
    action: 'create',
    resource: 'role',
    resourceId: String(role._id),
    after: { key: role.key, permissions: role.permissions },
  });
  return role;
}

/** Duplicates an existing role's permission set under a new key — Role & Permission Engine spec item ("Clone Roles"), lets an admin start from a known-good baseline instead of re-picking 30+ permissions by hand. */
export async function cloneRole(
  sourceKey: string,
  input: { key: string; name: string },
  actorId: string,
) {
  const source = await RoleModel.findOne({ key: sourceKey });
  if (!source) throw new NotFoundError('Role');

  const key = input.key.toLowerCase();
  if (await RoleModel.findOne({ key })) throw new ConflictError(`Role "${key}" already exists`);

  const clone = await RoleModel.create({
    key,
    name: input.name,
    permissions: source.permissions,
    isSystem: false,
    createdBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'create',
    resource: 'role',
    resourceId: String(clone._id),
    after: { key: clone.key, clonedFrom: sourceKey, permissions: clone.permissions },
  });

  return clone;
}

/**
 * Prompt 24 Part 16 — `authorize(permission(RESOURCES.ROLES, ACTIONS.UPDATE))`
 * at the route layer proves the actor can edit *some* role's permission
 * set; it does not distinguish "an ordinary role" from "the super_admin
 * role itself." Without this guard, any actor delegated `roles:update`
 * (not necessarily a super_admin — that's the whole point of a
 * Role/Permission engine) could rewrite what `super_admin` is allowed to
 * do, including granting it nothing and granting THEIR OWN role
 * everything instead. Only a super_admin may edit the super_admin role.
 */
export async function updateRolePermissions(
  key: string,
  permissions: string[],
  actorId: string,
  actorRole: Role,
) {
  if (key === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
    throw new ForbiddenError('Only a Super Admin can modify the Super Admin role');
  }

  const before = await RoleModel.findOne({ key }).select('permissions').lean();
  const role = await RoleModel.findOneAndUpdate(
    { key },
    { permissions, updatedBy: actorId },
    { new: true },
  );
  if (!role) throw new NotFoundError('Role');
  await invalidateRolePermissionsCache(key);

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'role',
    resourceId: String(role._id),
    before: { permissions: before?.permissions ?? [] },
    after: { permissions: role.permissions },
  });

  return role;
}

export async function deleteRole(key: string, actorId: string) {
  const role = await RoleModel.findOne({ key });
  if (!role) throw new NotFoundError('Role');
  if (role.isSystem) throw new UnprocessableEntityError('System roles cannot be deleted');

  await RoleModel.updateOne({ key }, { deletedAt: new Date() });
  await invalidateRolePermissionsCache(key);

  await recordAudit({
    actorId,
    action: 'delete',
    resource: 'role',
    resourceId: String(role._id),
    before: { key: role.key },
  });
}
