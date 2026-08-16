import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import { getPublicDistributorEnquiryConfig } from './distributor-enquiry-config.service';
import * as distributorEnquiryService from './distributor-enquiry.service';
import type { CreateDistributorEnquiryBody } from './distributor-enquiry.validator';

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId };
}

export const distributorEnquiryConfigHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await getPublicDistributorEnquiryConfig());
});

export const requestDistributorEnquiryOtpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.requestDistributorEnquiryOtp(req.body.email, requestMeta(req)),
  );
});

export const resendDistributorEnquiryOtpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.resendDistributorEnquiryOtp(req.body.email, requestMeta(req)),
  );
});

export const verifyDistributorEnquiryOtpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await distributorEnquiryService.verifyDistributorEnquiryOtp(
      req.body.email,
      req.body.code,
      requestMeta(req),
    ),
  );
});

/**
 * Part 9/34 — `req.user` comes ONLY from `optionalAuth` decoding a real
 * bearer token (see distributor-enquiry.routes.ts); the request body's own
 * shape (CreateDistributorEnquiryBody) has no userId field at all, so there
 * is nothing for a client to spoof here even in principle.
 */
export const createDistributorEnquiryHandler = asyncHandler(
  async (req: Request<ParamsDictionary, unknown, CreateDistributorEnquiryBody>, res) => {
    const result = await distributorEnquiryService.createDistributorEnquiry(
      req.body,
      req.user?.id ?? null,
      requestMeta(req),
    );
    return sendCreated(res, result);
  },
);

export const listMyDistributorEnquiriesHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await distributorEnquiryService.listMyDistributorEnquiries(req.user!.id));
});
