import { ACTIONS, DEFAULT_ROLES, PERMISSION_EFFECTS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { passwordSchema } from '../../utils/common-schemas';
import { validate } from '../../utils/validate';

import {
  createAdminUserHandler,
  getUserHandler,
  listUsersHandler,
  resetUserPasswordHandler,
  suspendUserHandler,
  unsuspendUserHandler,
  updateUserHandler,
} from './admin-user.controller';
import { listPermissionsHandler } from './permission-catalog.controller';
import {
  cloneRoleHandler,
  createRoleHandler,
  deleteRoleHandler,
  getRoleHandler,
  listRolesHandler,
  updateRolePermissionsHandler,
} from './role.controller';
import {
  grantUserPermissionHandler,
  listUserPermissionsHandler,
  revokeUserPermissionHandler,
} from './user-permission.controller';

export const rbacAdminRouter = Router();

const canManageRoles = authorize(permission(RESOURCES.ROLES, ACTIONS.UPDATE));
const canManageUsers = authorize(permission(RESOURCES.USERS, ACTIONS.UPDATE));

// Part 16 Step 4 — "Validate requested role": a plain `z.string().min(2)`
// let any string reach `assertCanAssignRole`, relying on Mongoose's schema
// enum to reject an invalid role (a raw 500-shaped ValidationError, not a
// clean 422). Enumerating the actual, current `DEFAULT_ROLES` here instead
// keeps this list from ever drifting from the real role set.
const roleSchema = z.enum(DEFAULT_ROLES as [string, ...string[]]);

rbacAdminRouter.use(requireAuth);

rbacAdminRouter.get('/permissions', canManageRoles, listPermissionsHandler);

rbacAdminRouter.get('/roles', canManageRoles, listRolesHandler);
rbacAdminRouter.get('/roles/:key', canManageRoles, getRoleHandler);
rbacAdminRouter.post(
  '/roles',
  canManageRoles,
  validate(
    z.object({
      key: z.string().min(2),
      name: z.string().min(2),
      permissions: z.array(z.string()).optional(),
    }),
  ),
  createRoleHandler,
);
rbacAdminRouter.put(
  '/roles/:key/permissions',
  canManageRoles,
  validate(z.object({ permissions: z.array(z.string()) })),
  updateRolePermissionsHandler,
);
rbacAdminRouter.delete('/roles/:key', canManageRoles, deleteRoleHandler);
rbacAdminRouter.post(
  '/roles/:key/clone',
  canManageRoles,
  validate(z.object({ key: z.string().min(2), name: z.string().min(2) })),
  cloneRoleHandler,
);

rbacAdminRouter.get('/users', canManageUsers, listUsersHandler);
rbacAdminRouter.get('/users/:id', canManageUsers, getUserHandler);
rbacAdminRouter.post(
  '/users',
  canManageUsers,
  validate(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: passwordSchema,
      role: roleSchema,
    }),
  ),
  createAdminUserHandler,
);
rbacAdminRouter.patch(
  '/users/:id',
  canManageUsers,
  validate(z.object({ role: roleSchema.optional(), isActive: z.boolean().optional() })),
  updateUserHandler,
);
rbacAdminRouter.post(
  '/users/:id/suspend',
  canManageUsers,
  validate(z.object({ reason: z.string().max(500).optional() })),
  suspendUserHandler,
);
rbacAdminRouter.post('/users/:id/unsuspend', canManageUsers, unsuspendUserHandler);
rbacAdminRouter.post(
  '/users/:id/reset-password',
  canManageUsers,
  validate(z.object({ newPassword: passwordSchema })),
  resetUserPasswordHandler,
);

rbacAdminRouter.get('/users/:userId/permissions', canManageUsers, listUserPermissionsHandler);
rbacAdminRouter.post(
  '/users/:userId/permissions',
  canManageUsers,
  validate(
    z.object({
      permissionKey: z.string().min(3),
      effect: z.enum(Object.values(PERMISSION_EFFECTS) as [string, ...string[]]),
      reason: z.string().max(500).optional(),
      expiresAt: z.coerce.date().nullable().optional(),
    }),
  ),
  grantUserPermissionHandler,
);
rbacAdminRouter.delete(
  '/users/:userId/permissions/:permissionKey',
  canManageUsers,
  revokeUserPermissionHandler,
);
