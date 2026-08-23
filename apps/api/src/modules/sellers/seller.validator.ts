import { z } from 'zod';

import { gstinSchema } from '../../utils/common-schemas';

export const createSellerSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  gstin: gstinSchema,
  drugLicenseNumber: z.string().trim().min(2).max(60),
  enabled: z.boolean().optional(),
   // invoice display/numbering.
  address: z.string().trim().max(500).optional(),
  invoiceCode: z
    .string()
    .trim()
    .max(8)
    .regex(/^[A-Za-z0-9]*$/, 'Invoice code may only contain letters and numbers')
    .optional(),
});

export const updateSellerSchema = createSellerSchema.partial();

export const updateSellerStatusSchema = z.object({
  enabled: z.boolean(),
});

export const bulkEditSellersSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: z.record(z.string(), z.unknown()),
});
