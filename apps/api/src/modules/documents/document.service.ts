import { DOCUMENT_STATUS, type DocumentStatus, type DocumentType, type StorageProvider } from '@medcommerce/shared';

import { DocumentModel } from './models/document.model';

export interface UpsertDocumentInput {
  entityType: DocumentType;
  entityId: string;
  sellerId: string | null;
  documentType: DocumentType;
  storageProvider: StorageProvider;
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status?: DocumentStatus;
}

/** Upsert-on-key (Part 5/20) — a retry/regeneration for the same entity overwrites this one authoritative row's storage fields rather than accumulating a new document record, while `version` still increments so history isn't silently lost. */
export async function upsertDocumentRecord(input: UpsertDocumentInput) {
  const existing = await DocumentModel.findOne({ entityType: input.entityType, entityId: input.entityId });
  return DocumentModel.findOneAndUpdate(
    { entityType: input.entityType, entityId: input.entityId },
    {
      $set: {
        sellerId: input.sellerId,
        documentType: input.documentType,
        storageProvider: input.storageProvider,
        bucket: input.bucket,
        objectKey: input.objectKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        status: input.status ?? DOCUMENT_STATUS.AVAILABLE,
        lastError: '',
        uploadedAt: new Date(),
        version: (existing?.version ?? 0) + 1,
      },
    },
    { upsert: true, new: true },
  );
}

/** Part 19/23 — records a failed upload attempt without touching the invoice/shipment record's own business state, so a transient storage failure never corrupts order/shipment state. */
export async function markDocumentFailed(
  entityType: DocumentType,
  entityId: string,
  sellerId: string | null,
  errorMessage: string,
) {
  return DocumentModel.findOneAndUpdate(
    { entityType, entityId },
    {
      $set: { status: DOCUMENT_STATUS.FAILED, lastError: errorMessage.slice(0, 500) },
      $setOnInsert: { sellerId, documentType: entityType, storageProvider: 's3', bucket: '', objectKey: '' },
    },
    { upsert: true, new: true },
  );
}

export function getDocumentByEntity(entityType: DocumentType, entityId: string) {
  return DocumentModel.findOne({ entityType, entityId }).lean();
}
