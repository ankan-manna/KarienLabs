import { z } from 'zod';

import { passwordSchema } from '../../utils/common-schemas';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

// Deliberately not tied to the configured OTP length (4-8) at the schema
// level — the service layer compares hashes, so a mismatched length here
// just fails verification like any other wrong code rather than needing the
// validator to know the live Configuration value.
const otpCodeSchema = z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received');

export const loginVerifyOtpSchema = z.object({
  challengeToken: z.string().min(1),
  code: otpCodeSchema,
});

export const loginResendOtpSchema = z.object({
  challengeToken: z.string().min(1),
});

export const registerVerifyOtpSchema = z.object({
  challengeToken: z.string().min(1),
  code: otpCodeSchema,
});

export const registerResendOtpSchema = z.object({
  challengeToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const forgotPasswordVerifyOtpSchema = z.object({
  email: z.string().trim().email(),
  code: otpCodeSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).optional(),
    resetSessionToken: z.string().min(1).optional(),
    password: passwordSchema,
  })
  .refine((data) => Boolean(data.token) !== Boolean(data.resetSessionToken), {
    message: 'Provide exactly one of token or resetSessionToken',
    path: ['token'],
  });

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginVerifyOtpInput = z.infer<typeof loginVerifyOtpSchema>;
export type RegisterVerifyOtpInput = z.infer<typeof registerVerifyOtpSchema>;
export type ForgotPasswordVerifyOtpInput = z.infer<typeof forgotPasswordVerifyOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
