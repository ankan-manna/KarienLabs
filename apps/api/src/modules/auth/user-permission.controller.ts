import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as userPermissionService from './user-permission.service';

export const grantUserPermissionHandler = asyncHandler(async (req: Request, res) => {
  const override = await userPermissionService.grantUserPermission(
    req.params.userId,
    req.body,
    req.user!.id,
    req.user!.role,
  );
  return sendCreated(res, override);
});

export const revokeUserPermissionHandler = asyncHandler(async (req: Request, res) => {
  const result = await userPermissionService.revokeUserPermission(
    req.params.userId,
    req.params.permissionKey,
    req.user!.id,
    req.user!.role,
  );
  return sendSuccess(res, result);
});

export const listUserPermissionsHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await userPermissionService.listUserPermissions(req.params.userId));
});
