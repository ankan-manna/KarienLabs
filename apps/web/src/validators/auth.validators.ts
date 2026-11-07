import { z } from 'zod';

// Matches the backend's normalization exactly (auth.validator.ts) — email is
// this app's username, so a login/lookup must never be case-sensitive.
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

// Must match the backend's passwordSchema (apps/api/src/utils/common-schemas.ts)
// exactly — a weaker client-side rule lets a password like "password123" pass
// this form's validation and then get silently 400'd by the server, which the
// user just sees as a generic "Registration failed" with no indication why.
const newPasswordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/\d/, 'Must contain a number');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short'),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    // Unchecked by default (react-hook-form has no value until the user
    // interacts) — `.literal(true)` fails validation with a specific message
    // for both "left unchecked" (undefined/false) and an explicit false.
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms & Conditions' }),
    }),
    acceptedPrivacy: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm you have read the Privacy Policy' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'Enter the code you received'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type OtpFormValues = z.infer<typeof otpSchema>;
