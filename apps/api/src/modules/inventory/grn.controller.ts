import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as grnService from './grn.service';

export const createGrnHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await grnService.createGrn(req.body, req.user!.id));
});

export const getGrnHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await grnService.getGrnById(req.params.id));
});
