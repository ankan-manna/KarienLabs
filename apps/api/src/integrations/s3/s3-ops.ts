import {
  getDocumentRetentionDays,
  getInvoiceRetentionDays,
  getLabelRetentionDays,
  isS3Configured,
  shouldUploadInvoiceToS3,
  shouldUploadLabelToS3,
  shouldUploadLogsToS3,
} from './s3.client';
import { deleteObject, getPresignedDownloadUrl, objectExists, uploadDocument } from './storage.service';

/**
 * a mutable indirection layer over the handful of S3 functions
 * `document-retention-sweep.job.ts` / `invoice.service.ts` /
 * `shiprocket-fulfillment.service.ts` need for the retention-expiry and
 * regeneration-on-download logic. Exists SOLELY so integration tests can
 * substitute a fake S3 transport via plain property reassignment
 * (`s3Ops.deleteObject = fn`) — this project's module loader (tsx, running
 * everything as ESM under the hood regardless of `import`/`require` syntax)
 * returns frozen, non-configurable module namespace objects even from
 * `require()`, so `node:test`'s `mock.method()` cannot patch a named export
 * of `storage.service.ts`/`s3.client.ts` directly (confirmed by inspecting
 * the property descriptor: `configurable: false`). Reassigning a plain
 * object's own property has no such restriction. Production code always
 * goes through the real implementations below; this changes no runtime
 * behavior, it only makes the call sites swappable in tests.
 */
export const s3Ops = {
  deleteObject,
  objectExists,
  uploadDocument,
  getPresignedDownloadUrl,
  isS3Configured,
  getDocumentRetentionDays,
  getInvoiceRetentionDays,
  getLabelRetentionDays,
  shouldUploadInvoiceToS3,
  shouldUploadLabelToS3,
  shouldUploadLogsToS3,
};
