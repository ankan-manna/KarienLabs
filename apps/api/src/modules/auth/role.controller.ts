import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as roleService from './role.service';

export const listRolesHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await roleService.listRoles());
});

export const getRoleHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await roleService.getRoleByKey(req.params.key));
});

export const createRoleHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await roleService.createRole(req.body, req.user!.id));
});

export const cloneRoleHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await roleService.cloneRole(req.params.key, req.body, req.user!.id));
});

export const updateRolePermissionsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await roleService.updateRolePermissions(
      req.params.key,
      req.body.permissions,
      req.user!.id,
      req.user!.role,
    ),
  );
});

export const deleteRoleHandler = asyncHandler(async (req: Request, res) => {
  await roleService.deleteRole(req.params.key, req.user!.id);
  return sendSuccess(res, { deleted: true });
});
