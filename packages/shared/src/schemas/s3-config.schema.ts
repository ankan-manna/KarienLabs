import { z } from 'zod';

/**
 * Validates the `s3` Configuration namespace's value shape before it's
 * persisted (configuration.service.ts's setConfiguration) — closes the gap
 * where `PUT /admin/configuration/:namespace` previously accepted any
 * `Record<string, unknown>` with zero shape/type checking for this
 * namespace. All fields are optional (a partial update only sets the keys
 * present), matching the existing merge-over-env-defaults read pattern in
 * s3.client.ts.
 */
export const s3ConfigSchema = z
  .object({
    region: z.string().trim().max(50).optional(),
    accessKeyId: z.string().trim().max(200).optional(),
    secretAccessKey: z.string().trim().max(500).optional(),
    bucket: z.string().trim().max(255).optional(),
    endpoint: z.string().trim().max(500).optional(),
    logRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
    documentRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
    invoiceRetentionDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    labelRetentionDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
    uploadInvoiceToS3: z.boolean().optional(),
    uploadLabelToS3: z.boolean().optional(),
    uploadLogsToS3: z.boolean().optional(),
  })
  .strict();

export type S3ConfigInput = z.infer<typeof s3ConfigSchema>;
