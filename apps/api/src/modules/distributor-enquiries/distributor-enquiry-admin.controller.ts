import type { Request } from 'express';

import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as distributorEnquiryService from './distributor-enquiry.service';

export const listDistributorEnquiriesAdminHandler = asyncHandler(async (req: Request, res) => {
  const result = await distributorEnquiryService.listDistributorEnquiriesAdmin(
    req.query as unknown as ListQuery,
  );
  return sendPaginated(res, result.items, result.meta);
});

export const getDistributorEnquiryAdminHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await distributorEnquiryService.getDistributorEnquiryAdmin(req.params.id));
});

export const updateDistributorEnquiryStatusHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.updateDistributorEnquiryStatus(
      req.params.id,
      req.body.status,
      req.user!.id,
    ),
  );
});

export const assignDistributorEnquiryHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.assignDistributorEnquiry(
      req.params.id,
      req.body.adminUserId,
      req.user!.id,
    ),
  );
});

export const addDistributorEnquiryNoteHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.addDistributorEnquiryNote(req.params.id, req.body.note, req.user!.id),
  );
});

export const listAssignableStaffHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await distributorEnquiryService.listAssignableStaff());
});
