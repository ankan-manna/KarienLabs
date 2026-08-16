import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware';
import { distributorEnquiryRateLimiter, otpRateLimiter } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../utils/validate';

import {
  createDistributorEnquiryHandler,
  distributorEnquiryConfigHandler,
  listMyDistributorEnquiriesHandler,
  requestDistributorEnquiryOtpHandler,
  resendDistributorEnquiryOtpHandler,
  verifyDistributorEnquiryOtpHandler,
} from './distributor-enquiry.controller';
import {
  createDistributorEnquirySchema,
  requestDistributorEnquiryOtpSchema,
  verifyDistributorEnquiryOtpSchema,
} from './distributor-enquiry.validator';

export const distributorEnquiryRouter = Router();

// Part 36 — unauthenticated; the /bulk-purchase page needs this before any
// session exists to decide whether to render the OTP step or the CTA at all.
distributorEnquiryRouter.get('/config', distributorEnquiryConfigHandler);

// Part 10/11 — guest-scoped (no userId; see otp.service.ts's guest branch),
// gated by the same otpRateLimiter every other OTP endpoint uses.
distributorEnquiryRouter.post(
  '/otp/request',
  otpRateLimiter,
  validate(requestDistributorEnquiryOtpSchema),
  requestDistributorEnquiryOtpHandler,
);
distributorEnquiryRouter.post(
  '/otp/resend',
  otpRateLimiter,
  validate(requestDistributorEnquiryOtpSchema),
  resendDistributorEnquiryOtpHandler,
);
distributorEnquiryRouter.post(
  '/otp/verify',
  otpRateLimiter,
  validate(verifyDistributorEnquiryOtpSchema),
  verifyDistributorEnquiryOtpHandler,
);

// Part 9 — optionalAuth: works for both a guest AND a signed-in customer:
// when a valid bearer token is present, req.user is populated and the
// service associates the enquiry with that account; otherwise it's a guest
// submission. Never accepts a userId from the request body either way.
distributorEnquiryRouter.post(
  '/',
  distributorEnquiryRateLimiter,
  optionalAuth,
  validate(createDistributorEnquirySchema),
  createDistributorEnquiryHandler,
);

distributorEnquiryRouter.get('/me', requireAuth, listMyDistributorEnquiriesHandler);
