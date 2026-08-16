import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { otpRateLimiter, sensitiveAccountActionRateLimiter } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../utils/validate';

import {
  confirmPhoneChangeHandler,
  deactivateAccountHandler,
  getMyProfileHandler,
  requestPhoneChangeHandler,
  updateMyProfileHandler,
} from './profile.controller';
import {
  confirmPhoneChangeSchema,
  deactivateAccountSchema,
  requestPhoneChangeSchema,
  updateProfileSchema,
} from './profile.validator';

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get('/me', getMyProfileHandler);
profileRouter.patch('/me', validate(updateProfileSchema), updateMyProfileHandler);

// Part 3 — OTP-verified phone change (reuses the existing OTP system; see
// otp.service.ts/profile.service.ts). `issueOtp`'s own cooldown/max-resend
// limits already bound the request side; `otpRateLimiter` (Prompt 24 Part
// 2) is an additional outer HTTP-level guard, consistent with every other
// OTP-touching endpoint in the app.
profileRouter.post(
  '/me/phone/request-change',
  otpRateLimiter,
  validate(requestPhoneChangeSchema),
  requestPhoneChangeHandler,
);
profileRouter.post(
  '/me/phone/confirm-change',
  otpRateLimiter,
  validate(confirmPhoneChangeSchema),
  confirmPhoneChangeHandler,
);

// Part 35 — safe, reversible-by-admin self-deactivation (never a hard delete).
profileRouter.post(
  '/me/deactivate',
  sensitiveAccountActionRateLimiter,
  validate(deactivateAccountSchema),
  deactivateAccountHandler,
);
