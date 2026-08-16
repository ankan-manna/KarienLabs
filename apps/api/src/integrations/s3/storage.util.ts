import os from 'node:os';

import { DOCUMENT_TYPES, type DocumentType } from '@medcommerce/shared';

/**
 * Pure, DB/AWS-free helpers — deliberately split out from storage.service.ts
 * so the deterministic-key and file-validation logic (Part 3/20/24) is
 * unit-testable without mocking the AWS SDK (see storage.util.test.ts).
 */

/**
 * Deterministic S3 object key (Part 3/20) — re-uploading for the same
 * (documentType, sellerId, entityId) always produces the SAME key, which is
 * exactly what makes retries idempotent (an overwrite, never a duplicate
 * object) and what future seller-scoped retention/reporting can rely on.
 * `sellerId` folds into the path so per-seller document listing/cleanup is a
 * simple prefix query later, without needing a DB join.
 */
export function buildDocumentObjectKey(params: {
  documentType: DocumentType;
  sellerId: string | null;
  entityId: string;
  date?: Date;
  extension?: string;
}): string {
  const date = params.date ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const seller = params.sellerId || 'unassigned';
  const ext = params.extension ?? 'pdf';

  const prefix =
    params.documentType === DOCUMENT_TYPES.SHIPPING_LABEL
      ? 'shipping-labels'
      : params.documentType === DOCUMENT_TYPES.RETURN_LABEL
        ? 'return-labels'
        : 'invoices';

  return `${prefix}/${seller}/${year}/${month}/${params.entityId}.${ext}`;
}

/**
 * Prompt 17 Part 11 — prescriptions get their OWN key shape
 * (`prescriptions/{customerId}/{year}/{month}/{prescriptionId}/{file}`)
 * rather than reusing buildDocumentObjectKey's `{prefix}/{sellerId}/...`
 * shape above: a prescription belongs to a CUSTOMER, not a seller (a
 * customer's prescriptions aren't seller-scoped data), and re-upload
 * (Part 28/29) needs a per-prescription-id folder so each version gets its
 * own object rather than overwriting the prior one.
 */
export function buildPrescriptionObjectKey(params: {
  customerId: string;
  prescriptionId: string;
  fileName: string;
  date?: Date;
}): string {
  const date = params.date ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  // Strip anything outside a safe charset, then collapse repeated dots
  // (S3 keys don't actually resolve ".." as filesystem traversal, but a
  // sanitized, unambiguous key is still the right default) before taking
  // the last 120 characters so a very long original name can't blow out
  // the key.
  const safeFileName =
    params.fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(-120) || 'prescription';
  return `prescriptions/${params.customerId}/${year}/${month}/${params.prescriptionId}/${safeFileName}`;
}

const PRESCRIPTION_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const PRESCRIPTION_ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MAX_PRESCRIPTION_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a scanned prescription photo/PDF.

/** Part 9/48 — validated BEFORE a presigned upload URL is even issued, so an unsupported file type/size never reaches S3 at all. */
export function assertValidPrescriptionFile(input: {
  mimeType: string;
  fileName: string;
  fileSize: number;
}): void {
  if (!PRESCRIPTION_ALLOWED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    throw new Error(`Unsupported file type "${input.mimeType}" — only PDF, JPG, and PNG are accepted`);
  }
  const ext = input.fileName.toLowerCase().slice(input.fileName.lastIndexOf('.'));
  if (!PRESCRIPTION_ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension "${ext}" — only .pdf, .jpg, .jpeg, .png are accepted`);
  }
  if (input.fileSize <= 0) {
    throw new Error('File is empty');
  }
  if (input.fileSize > MAX_PRESCRIPTION_SIZE_BYTES) {
    throw new Error(`File exceeds the maximum allowed size (${MAX_PRESCRIPTION_SIZE_BYTES} bytes)`);
  }
}

/**
 * Prompt 18 Part 9/10/16 — deterministic, per-category, per-instance S3 key
 * for a compressed rotated log archive:
 *   logs/{category}/{YYYY}/{MM}/{DD}/{instanceId}/{category}.{bucketLabel}.log.gz
 *
 * `category` is e.g. `api-application` / `worker-third-party-api` /
 * `api-pool-stats` (see log-rotation.ts / config/logger.ts) — this alone
 * gives application/third-party-api/pool-stats their own dedicated S3
 * sub-prefix (Part 10), and further splits by process (api vs worker).
 *
 * `instanceId` (defaults to `os.hostname()`, stable for a container's whole
 * lifetime) is what makes this safe under a multi-replica deployment
 * (docker-compose.prod.yml runs 2 `api` replicas): every replica computes
 * the SAME key for the SAME bucket on RETRY (Part 16 idempotency holds),
 * but two DIFFERENT replicas never collide on the same key for the same
 * 6-hour window (which a purely category+bucketLabel key — as literally
 * shown in the prompt's own illustrative example — would NOT guarantee).
 */
export function buildLogObjectKey(params: { category: string; bucketLabel: string; instanceId?: string }): string {
  const [year, month, day] = params.bucketLabel.split('-');
  const instance = (params.instanceId ?? os.hostname()).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `logs/${params.category}/${year}/${month}/${day}/${instance}/${params.category}.${params.bucketLabel}.log.gz`;
}

/** `YYYY-MM-DD-HH` -> a Date at that instant (treated as UTC purely for age-comparison purposes — a few hours of timezone skew never matters against a 20-day retention window). */
export function bucketLabelToDate(bucketLabel: string): Date {
  const [year, month, day, hour] = bucketLabel.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour));
}

/** Whether a given UTC day (from a filename-derived date) is at or past the retention cutoff — the pure predicate behind both the lifecycle-rule config and the app-level safety-net sweep. */
export function isPastRetention(fileDate: Date, retentionDays: number, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - fileDate.getTime();
  return ageMs >= retentionDays * 24 * 60 * 60 * 1000;
}

const PDF_MAGIC_BYTES = Buffer.from('%PDF');

/**
 * Part 24 — defensive sanity check before upload. Both invoice and label
 * PDFs are always internally generated (Puppeteer render / fetched from
 * Shiprocket's own label API), never a raw user upload, so this isn't a
 * hostile-input security boundary — it's a guard against silently uploading
 * a truncated/corrupt buffer (e.g. a failed fetch that returned an HTML
 * error page instead of a PDF) as if it were a valid document.
 */
export function assertValidPdfBuffer(buffer: Buffer): void {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Document buffer is empty');
  }
  if (buffer.subarray(0, 4).compare(PDF_MAGIC_BYTES) !== 0) {
    throw new Error('Document buffer is not a valid PDF');
  }
}

const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous ceiling for an invoice/label PDF.

export function assertDocumentSizeWithinLimit(buffer: Buffer): void {
  if (buffer.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`Document exceeds the maximum allowed size (${MAX_DOCUMENT_SIZE_BYTES} bytes)`);
  }
}
