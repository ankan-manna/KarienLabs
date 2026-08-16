import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authRateLimiter, otpRateLimiter, passwordResetRateLimiter } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../utils/validate';

import {
  authConfigHandler,
  changePasswordHandler,
  forgotPasswordHandler,
  forgotPasswordVerifyOtpHandler,
  googleCallbackHandler,
  googleLoginHandler,
  listSessionsHandler,
  loginHandler,
  loginResendOtpHandler,
  loginVerifyOtpHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  registerResendOtpHandler,
  registerVerifyOtpHandler,
  requestEmailVerificationHandler,
  resetPasswordHandler,
  revokeSessionHandler,
  verifyEmailHandler,
} from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  forgotPasswordVerifyOtpSchema,
  loginResendOtpSchema,
  loginSchema,
  loginVerifyOtpSchema,
  registerResendOtpSchema,
  registerSchema,
  registerVerifyOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validator';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate(registerSchema), registerHandler);
authRouter.post(
  '/register/verify-otp',
  otpRateLimiter,
  validate(registerVerifyOtpSchema),
  registerVerifyOtpHandler,
);
authRouter.post(
  '/register/resend-otp',
  otpRateLimiter,
  validate(registerResendOtpSchema),
  registerResendOtpHandler,
);
authRouter.post('/login', authRateLimiter, validate(loginSchema), loginHandler);
authRouter.post(
  '/login/verify-otp',
  otpRateLimiter,
  validate(loginVerifyOtpSchema),
  loginVerifyOtpHandler,
);
authRouter.post(
  '/login/resend-otp',
  otpRateLimiter,
  validate(loginResendOtpSchema),
  loginResendOtpHandler,
);
authRouter.post('/refresh', authRateLimiter, refreshHandler);
authRouter.post('/logout', logoutHandler);

authRouter.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordHandler,
);
authRouter.post(
  '/forgot-password/verify-otp',
  passwordResetRateLimiter,
  validate(forgotPasswordVerifyOtpSchema),
  forgotPasswordVerifyOtpHandler,
);
authRouter.post(
  '/reset-password',
  passwordResetRateLimiter,
  validate(resetPasswordSchema),
  resetPasswordHandler,
);

authRouter.post('/verify-email/request', requireAuth, requestEmailVerificationHandler);
authRouter.post('/verify-email/confirm', validate(verifyEmailSchema), verifyEmailHandler);

authRouter.get('/me', requireAuth, meHandler);
authRouter.get('/auth-config', authConfigHandler);

// Admin "Continue with Google" (Prompt 10 Part 3) — GET, not POST: this is a
// browser-navigation OAuth redirect flow, not a JSON API call.
authRouter.get('/google', authRateLimiter, googleLoginHandler);
authRouter.get('/google/callback', authRateLimiter, googleCallbackHandler);

authRouter.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  changePasswordHandler,
);
authRouter.get('/sessions', requireAuth, listSessionsHandler);
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionHandler);
