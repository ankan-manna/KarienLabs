import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { otpRateLimiter, sensitiveAccountActionRateLimiter } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../utils/validate';

import {
  addressVerificationConfigHandler,
  confirmAddressMobileOtpHandler,
  createAddressHandler,
  deleteAddressHandler,
  listMyAddressesHandler,
  requestAddressMobileOtpHandler,
  setDefaultAddressHandler,
  updateAddressHandler,
} from './address.controller';
import { confirmAddressMobileOtpSchema, createAddressSchema, updateAddressSchema } from './address.validator';

export const addressRouter = Router();

addressRouter.use(requireAuth);
addressRouter.get('/verification-config', addressVerificationConfigHandler);
addressRouter.get('/', listMyAddressesHandler);
// Part 40 — bounded to prevent address-book spam.
addressRouter.post('/', sensitiveAccountActionRateLimiter, validate(createAddressSchema), createAddressHandler);
addressRouter.patch('/:id', validate(updateAddressSchema), updateAddressHandler);
// Part 5/7 — dedicated set/unset-default action (atomic, see address.service.ts).
addressRouter.patch('/:id/default', validate(z.object({ isDefault: z.boolean() })), setDefaultAddressHandler);
addressRouter.delete('/:id', deleteAddressHandler);

// Prompt 31 Part 2/23 — per-address mobile-OTP verification.
addressRouter.post('/:id/mobile-otp/request', otpRateLimiter, requestAddressMobileOtpHandler);
addressRouter.post(
  '/:id/mobile-otp/confirm',
  otpRateLimiter,
  validate(confirmAddressMobileOtpSchema),
  confirmAddressMobileOtpHandler,
);
