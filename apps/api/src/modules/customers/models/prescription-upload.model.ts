import { DOCUMENT_STATUS, PRESCRIPTION_STATUS, STORAGE_PROVIDERS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * extends the pre-existing model (do not remove
 * userId/orderId/cloudinaryPublicId/status/verifiedBy/verifiedAt/
 * rejectionReason/notes — real historical data depends on them) with:
 *  - S3 storage fields (Part 10/11) for NEW uploads going forward;
 *    `cloudinaryPublicId` becomes `required: false` (was `true`) so it's
 *    correctly optional/empty on S3-backed rows — existing Cloudinary rows
 *    are completely untouched (Part 41/54).
 *  - orderItemIds (Part 17/18) — which specific order line(s) this
 *    prescription covers, not just "which order."
 *  - version/previousVersionId (Part 28/29) — re-upload creates a new row
 *    rather than overwriting; old versions stay queryable forever.
 *  - expiryDate (Part 20) — set when approved, per the configured validity window.
 */
const prescriptionUploadSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  orderItemIds: { type: [Schema.Types.ObjectId], default: [] },

  // Legacy Cloudinary path (pre--17 rows, and the automatic fallback
  // when S3 isn't configured — see prescription.service.ts).
  cloudinaryPublicId: { type: String, default: null },

   // S3 StorageService path (Part 10/11/12).
  storageProvider: { type: String, enum: Object.values(STORAGE_PROVIDERS), default: null },
  bucket: { type: String, default: '' },
  objectKey: { type: String, default: '' },
  fileName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  documentStatus: { type: String, enum: Object.values(DOCUMENT_STATUS), default: DOCUMENT_STATUS.AVAILABLE },

  status: {
    type: String,
    enum: Object.values(PRESCRIPTION_STATUS),
    default: PRESCRIPTION_STATUS.PENDING,
    index: true,
  },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  notes: { type: String, default: '' },

  // Part 20 — expiry.
  expiryDate: { type: Date, default: null, index: true },

  // Part 28/29 — versioning. NOT named `version` — auditPlugin already
  // reserves that exact field name as Mongoose's renamed internal
  // optimistic-concurrency versionKey (`schema.set('versionKey', 'version')`),
  // which would silently collide with and override a same-named business
  // field. `revisionNumber` starts at 1; a re-upload after rejection
  // creates a NEW document with `previousVersionId` pointing back at the
  // row it supersedes, never mutates the old one.
  revisionNumber: { type: Number, default: 1 },
  previousVersionId: { type: Schema.Types.ObjectId, ref: 'PrescriptionUpload', default: null },
});

prescriptionUploadSchema.index({ expiryDate: 1, status: 1 });

auditPlugin(prescriptionUploadSchema);

export type PrescriptionUploadDocument = InferSchemaType<typeof prescriptionUploadSchema>;
export const PrescriptionUploadModel = model('PrescriptionUpload', prescriptionUploadSchema);
