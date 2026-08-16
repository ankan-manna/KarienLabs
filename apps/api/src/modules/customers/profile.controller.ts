import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as profileService from './profile.service';

function requestMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
    role: 'customer' as const,
  };
}

export const getMyProfileHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await profileService.getOrCreateProfile(req.user!.id));
});

export const updateMyProfileHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await profileService.updateProfile(req.user!.id, req.body));
});

export const requestPhoneChangeHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await profileService.requestPhoneChange(req.user!.id, req.body.phone, requestMeta(req)),
  );
});

export const confirmPhoneChangeHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await profileService.confirmPhoneChange(req.user!.id, req.body.code, requestMeta(req)),
  );
});

export const deactivateAccountHandler = asyncHandler(async (req: Request, res) => {
  await profileService.deactivateAccount(req.user!.id, req.body.password, req.body.reason);
  return sendSuccess(res, { deactivated: true });
});
