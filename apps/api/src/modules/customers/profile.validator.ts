import { z } from 'zod';

/**
 * Prompt 21 Part 3 — `phone` is deliberately NOT in this schema. It is a
 * security-sensitive identifier and can only change via the OTP-verified
 * requestPhoneChangeSchema/confirmPhoneChangeSchema flow below (profile.service.ts's
 * requestPhoneChange/confirmPhoneChange) — never a blind PATCH.
 */
export const updateProfileSchema = z.object({
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  medicalConditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  preferredLanguage: z.string().max(10).optional(),
  avatarUrl: z.string().optional(),
  notificationPreferences: z
    .object({
      orderUpdates: z.boolean().optional(),
      paymentUpdates: z.boolean().optional(),
      deliveryUpdates: z.boolean().optional(),
      offersAndAnnouncements: z.boolean().optional(),
      emailEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
    })
    .optional(),
});

export const requestPhoneChangeSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{6,20}$/, 'Enter a valid phone number'),
});

export const confirmPhoneChangeSchema = z.object({
  code: z.string().trim().min(4).max(10),
});

export const deactivateAccountSchema = z.object({
  password: z.string().min(1, 'Current password is required'),
  reason: z.string().max(500).optional(),
});
