import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const getUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export const confirmPrescriptionUploadSchema = z.object({
  // Legacy Cloudinary path.
  cloudinaryPublicId: z.string().min(1).optional(),
  // S3 path.
  prescriptionId: objectIdSchema.optional(),
  objectKey: z.string().min(1).optional(),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(100).optional(),
  fileSize: z.number().int().positive().optional(),
  // Common.
  orderId: objectIdSchema.nullable().optional(),
  orderItemIds: z.array(z.string()).optional(),
});

export const rejectPrescriptionSchema = z.object({
  rejectionReason: z.string().trim().min(3).max(500),
});

/** Part 40 — an explicit whitelist at the HTTP boundary too, ahead of the service-layer dependency validation. */
export const setPrescriptionConfigSchema = z
  .object({
    managementEnabled: z.boolean().optional(),
    uploadEnabled: z.boolean().optional(),
    verificationEnabled: z.boolean().optional(),
    reuseEnabled: z.boolean().optional(),
    orderBlockingEnabled: z.boolean().optional(),
    checkoutUploadRequired: z.boolean().optional(),
    validityEnabled: z.boolean().optional(),
    validityDays: z.number().int().positive().max(3650).optional(),
  })
  .strict();
