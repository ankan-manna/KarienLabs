import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as configurationService from './configuration.service';

export const getConfigurationHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await configurationService.getConfiguration(req.params.namespace));
});

export const setConfigurationHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await configurationService.setConfiguration(req.params.namespace, req.body.value, req.user!.id),
  );
});
