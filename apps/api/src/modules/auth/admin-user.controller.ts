import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as adminUserService from './admin-user.service';

export const listUsersHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await adminUserService.listUsers(req.query as unknown as ListQuery));
});

export const getUserHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await adminUserService.getUserById(req.params.id));
});

export const createAdminUserHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await adminUserService.createAdminUser(req.body, req.user!.id, req.user!.role));
});

export const updateUserHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await adminUserService.updateUserRoleOrStatus(req.params.id, req.body, req.user!.id, req.user!.role),
  );
});

export const suspendUserHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await adminUserService.suspendUser(req.params.id, req.body.reason ?? '', req.user!.id, req.user!.role),
  );
});

export const unsuspendUserHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await adminUserService.unsuspendUser(req.params.id, req.user!.id, req.user!.role));
});

export const resetUserPasswordHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await adminUserService.resetUserPassword(req.params.id, req.body.newPassword, req.user!.id, req.user!.role),
  );
});
