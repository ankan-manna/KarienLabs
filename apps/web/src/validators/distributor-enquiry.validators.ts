import { z } from 'zod';

const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const distributorEnquiryFormSchema = z.object({
  companyName: z.string().trim().min(2, 'Required').max(200),
  contactPerson: z.string().trim().min(2, 'Required').max(100),
  email: z.string().trim().email('Enter a valid email'),
  mobile: z
    .string()
    .trim()
    .min(6, 'Enter a valid mobile number')
    .max(20),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(gstinPattern, 'Enter a valid 15-character GSTIN')
    .optional()
    .or(z.literal('')),
  businessAddress: z.string().trim().min(5, 'Required').max(500),
  city: z.string().trim().min(2, 'Required').max(100),
  state: z.string().trim().min(2, 'Required').max(100),
  pincode: z.string().trim().min(4, 'Required').max(10),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type DistributorEnquiryFormValues = z.infer<typeof distributorEnquiryFormSchema>;

export const distributorOtpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received'),
});

export type DistributorOtpCodeFormValues = z.infer<typeof distributorOtpCodeSchema>;
