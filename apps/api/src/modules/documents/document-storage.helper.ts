import { STORAGE_PROVIDERS, type DocumentType, type StorageProvider } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { uploadBuffer } from '../../integrations/cloudinary/cloudinary.service';
import { s3Ops } from '../../integrations/s3/s3-ops';
import { isS3Configured } from '../../integrations/s3/s3.client';
import {
  assertDocumentSizeWithinLimit,
  assertValidPdfBuffer,
  buildDocumentObjectKey,
} from '../../integrations/s3/storage.util';

import { markDocumentFailed, upsertDocumentRecord } from './document.service';

/**
 * The ONE place invoice.service.ts and shiprocket-fulfillment.service.ts
 * upload a PDF and get back the reference to store on their own record
 * (`invoice.pdfUrl` / `shipment.labelUrl`) — this is the "centralized
 * StorageService" boundary (Part 1): neither of those two modules imports
 * the AWS SDK or Cloudinary's uploadBuffer directly, both call this.
 *
 * Falls back to the pre-existing Cloudinary path when S3 isn't configured
 * (same self-disabling pattern as every other 3rd-party integration added
 * in this project — Shiprocket, Google OAuth, Razorpay) so every environment
 * that hasn't set AWS credentials yet keeps working completely unchanged.
 */
export interface UploadAndRecordInput {
  documentType: DocumentType;
  /** Document.entityId — the stable owning record's id (orderId for an invoice, shipmentId for a label). */
  entityId: string;
  /** What goes into the deterministic object key (invoiceNumber / shipmentId) — may differ from entityId. */
  objectKeyId: string;
  sellerId: string | null;
  buffer: Buffer;
  fileName: string;
}

export interface UploadAndRecordResult {
  /** For S3: the object key (private, not directly fetchable). For Cloudinary: the already-public URL. Store this verbatim on the owning record. */
  ref: string;
  storageProvider: StorageProvider;
}

export async function uploadAndRecordDocument(input: UploadAndRecordInput): Promise<UploadAndRecordResult> {
  assertValidPdfBuffer(input.buffer);
  assertDocumentSizeWithinLimit(input.buffer);

  if (await isS3Configured()) {
    try {
      const objectKey = buildDocumentObjectKey({
        documentType: input.documentType,
        sellerId: input.sellerId,
        entityId: input.objectKeyId,
      });
      const result = await s3Ops.uploadDocument({
        buffer: input.buffer,
        objectKey,
        contentType: 'application/pdf',
      });
      await upsertDocumentRecord({
        entityType: input.documentType,
        entityId: input.entityId,
        sellerId: input.sellerId,
        documentType: input.documentType,
        storageProvider: STORAGE_PROVIDERS.S3,
        bucket: result.bucket,
        objectKey: result.objectKey,
        fileName: input.fileName,
        mimeType: 'application/pdf',
        fileSize: result.fileSize,
      });
      return { ref: objectKey, storageProvider: STORAGE_PROVIDERS.S3 };
    } catch (error) {
      logger.error(
        { documentType: input.documentType, entityId: input.entityId, error },
        'S3 document upload failed',
      );
      await markDocumentFailed(
        input.documentType,
        input.entityId,
        input.sellerId,
        error instanceof Error ? error.message : 'S3 upload failed',
      );
      throw error;
    }
  }

  // S3 not configured — unchanged pre-Prompt-15 behavior.
  const cloudinaryFolder =
    input.documentType === 'invoice'
      ? 'invoices'
      : input.documentType === 'return_label'
        ? 'return-labels'
        : 'shipping-labels';
  const { url } = await uploadBuffer(input.buffer, {
    folder: cloudinaryFolder,
    publicId: input.objectKeyId,
  });
  await upsertDocumentRecord({
    entityType: input.documentType,
    entityId: input.entityId,
    sellerId: input.sellerId,
    documentType: input.documentType,
    storageProvider: STORAGE_PROVIDERS.CLOUDINARY,
    bucket: '',
    objectKey: url,
    fileName: input.fileName,
    mimeType: 'application/pdf',
    fileSize: input.buffer.byteLength,
  });
  return { ref: url, storageProvider: STORAGE_PROVIDERS.CLOUDINARY };
}

/** Turns a stored `ref` (S3 object key or Cloudinary URL) + provider into an actual usable link — presigned + short-lived for S3, passthrough for legacy Cloudinary rows. This is the ONLY function callers should use to get a link to hand to a browser/email. */
export async function resolveDocumentDownloadUrl(
  storageProvider: StorageProvider | undefined,
  ref: string | null | undefined,
  expiresInSeconds?: number,
): Promise<string | null> {
  if (!ref) return null;
  if (storageProvider === STORAGE_PROVIDERS.S3) {
    return s3Ops.getPresignedDownloadUrl(ref, expiresInSeconds);
  }
  return ref;
}
