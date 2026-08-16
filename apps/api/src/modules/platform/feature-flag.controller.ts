import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as featureFlagService from './feature-flag.service';

export const listFeatureFlagsHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await featureFlagService.listFeatureFlags());
});

export const getActiveFlagsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await featureFlagService.getActiveFlags({ role: req.user?.role, userId: req.user?.id }),
  );
});

export const createFeatureFlagHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await featureFlagService.createFeatureFlag(req.body, req.user!.id));
});

export const updateFeatureFlagHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await featureFlagService.updateFeatureFlag(req.params.key, req.body, req.user!.id),
  );
});

export const setFeatureFlagEnabledHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await featureFlagService.setFeatureFlagEnabled(req.params.key, req.body.enabled, req.user!.id),
  );
});

export const deleteFeatureFlagHandler = asyncHandler(async (req, res) => {
  await featureFlagService.deleteFeatureFlag(req.params.key);
  return sendSuccess(res, { deleted: true });
});
