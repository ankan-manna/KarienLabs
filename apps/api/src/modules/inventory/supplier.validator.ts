import { z } from 'zod';

const contactPersonSchema = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().max(80).optional(),
});

const bankDetailsSchema = z.object({
  accountNumber: z.string().max(40).optional(),
  ifscCode: z.string().max(20).optional(),
  bankName: z.string().max(120).optional(),
  accountHolderName: z.string().max(120).optional(),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  gstin: z.string().max(20).optional(),
  pan: z.string().max(20).optional(),
  contactPerson: z.string().max(120).optional(),
  contactPersons: z.array(contactPersonSchema).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  paymentTerms: z.string().max(200).optional(),
  bankDetails: bankDetailsSchema.optional(),
  performanceRating: z.number().min(0).max(5).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const bulkEditSuppliersSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: z.record(z.string(), z.unknown()),
});
