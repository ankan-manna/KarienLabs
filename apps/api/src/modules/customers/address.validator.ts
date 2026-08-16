import { z } from 'zod';

export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  type: z.enum(['shipping', 'billing', 'both']).optional(),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().min(4).max(10),
  country: z.string().max(60).optional(),
  phone: z.string().trim().min(6).max(20),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

const addressOtpCodeSchema = z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received');

export const confirmAddressMobileOtpSchema = z.object({
  code: addressOtpCodeSchema,
});
