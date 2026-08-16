import { z } from 'zod';

export const addressFormSchema = z.object({
  label: z.string().trim().min(1, 'Required'),
  line1: z.string().trim().min(3, 'Too short'),
  line2: z.string().optional(),
  city: z.string().trim().min(2, 'Required'),
  state: z.string().trim().min(2, 'Required'),
  pincode: z.string().trim().min(4, 'Required'),
  phone: z.string().trim().min(6, 'Required'),
  isDefault: z.boolean().optional(),
});

export type AddressFormValues = z.infer<typeof addressFormSchema>;

export const otpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received'),
});

export type OtpCodeFormValues = z.infer<typeof otpCodeSchema>;
