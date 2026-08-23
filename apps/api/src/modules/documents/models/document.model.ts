import { DOCUMENT_STATUS, DOCUMENT_TYPES, STORAGE_PROVIDERS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Part 27 — ONE reusable document-metadata model, not separate
 * InvoiceFile/ShipmentFile/LogFile collections. `entityType`/`entityId` is a
 * generic polymorphic reference (`invoice`|`shipment`|`log_bundle` today;
 * future Return/Replacement/Refund/Prescription documents reuse this same
 * model per Part 33/36 without a schema change). The PDF/label/log BYTES
 * never live here — only the S3 reference + operational metadata (Part 4/7).
 */
const documentSchema = new Schema({
  entityType: { type: String, enum: Object.values(DOCUMENT_TYPES), required: true, index: true },
  entityId: { type: Schema.Types.ObjectId, required: true, index: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
  documentType: { type: String, enum: Object.values(DOCUMENT_TYPES), required: true },

  storageProvider: {
    type: String,
    enum: Object.values(STORAGE_PROVIDERS),
    required: true,
  },
  bucket: { type: String, default: '' },
  objectKey: { type: String, required: true },
  fileName: { type: String, default: '' },
  mimeType: { type: String, default: 'application/pdf' },
  fileSize: { type: Number, default: 0 },
  version: { type: Number, default: 1 },

  status: {
    type: String,
    enum: Object.values(DOCUMENT_STATUS),
    default: DOCUMENT_STATUS.GENERATING,
    index: true,
  },
  // Safe, admin-only operational error detail (Part 19/29) — never the raw
  // AWS error object, never credentials.
  lastError: { type: String, default: '' },
  uploadedAt: { type: Date, default: null },
});

// One authoritative document per (entityType, entityId) at a time — a new
// version overwrites this row's storage fields rather than creating a
// second document record (Part 5: reuse the existing reference, don't
// unlimited-duplicate on retry/regeneration).
documentSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
documentSchema.index({ sellerId: 1, documentType: 1 });
// supports the retention sweep's query (document-retention-sweep.job.ts):
// "AVAILABLE invoice/label objects uploaded before the retention cutoff",
// paginated/batched rather than a full collection scan.
documentSchema.index({ documentType: 1, status: 1, uploadedAt: 1 });

auditPlugin(documentSchema);

export type DocumentMetadataDocument = InferSchemaType<typeof documentSchema>;
export const DocumentModel = model('Document', documentSchema);
