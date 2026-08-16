/**
 * Prompt 15 — centralized document storage (S3) vocabulary. Shared between
 * the invoice, shipment-label, and log-upload flows so all three speak the
 * same status/provider vocabulary instead of each inventing its own.
 */
export const STORAGE_PROVIDERS = {
  CLOUDINARY: 'cloudinary',
  S3: 's3',
} as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[keyof typeof STORAGE_PROVIDERS];

/** Part 23 — controlled document lifecycle status, distinct from the SHIPMENT/ORDER/INVOICE business-status enums; this is purely about "is the file itself available yet." */
export const DOCUMENT_STATUS = {
  GENERATING: 'generating',
  UPLOADING: 'uploading',
  AVAILABLE: 'available',
  FAILED: 'failed',
  RETRYING: 'retrying',
  // Prompt 27 (fulfillment automation) — the S3 object was deleted by the
  // retention sweep after its configured retention window; the DB record
  // (and everything needed to regenerate it — invoice tax snapshot / label
  // provider identifiers) deliberately still exists. NOT the same as
  // FAILED (nothing went wrong) or GENERATING (nothing is in progress) —
  // a distinct, expected terminal state that a download request transparently
  // recovers from by regenerating, see invoice.service.ts / shipment.controller.ts.
  EXPIRED: 'expired',
} as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export const DOCUMENT_TYPES = {
  INVOICE: 'invoice',
  SHIPPING_LABEL: 'shipping_label',
  LOG_BUNDLE: 'log_bundle',
  // Prompt 16 — reverse-pickup shipping label, stored through the SAME
  // StorageService/Document pipeline as a forward shipping label, just a
  // distinct documentType so it's never confused with the outbound one.
  RETURN_LABEL: 'return_label',
  // Prompt 17 — customer-uploaded prescription image/PDF. Migrates
  // prescription storage off the old Cloudinary-only direct-upload path
  // onto the same private-S3 StorageService pipeline every other business
  // document already uses (Part 10/11/47).
  PRESCRIPTION: 'prescription',
} as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

export const STORAGE_AUDIT_ACTIONS = {
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_UPLOAD_FAILED: 'DOCUMENT_UPLOAD_FAILED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  LOG_BATCH_UPLOADED: 'LOG_BATCH_UPLOADED',
  LOG_RETENTION_SWEEP_RAN: 'LOG_RETENTION_SWEEP_RAN',
  LOG_LIFECYCLE_RULE_CONFIGURED: 'LOG_LIFECYCLE_RULE_CONFIGURED',
  // Prompt 18 Part 34/35 — structured archival-pipeline event names, one
  // per observable stage, so an operator can trace a single rotated file's
  // journey (compress -> upload -> cleanup, or a failure at any stage)
  // straight from the audit trail rather than only from raw log lines.
  LOG_ARCHIVE_COMPRESSED: 'LOG_ARCHIVE_COMPRESSED',
  LOG_ARCHIVE_COMPRESSION_FAILED: 'LOG_ARCHIVE_COMPRESSION_FAILED',
  LOG_ARCHIVE_UPLOADED: 'LOG_ARCHIVE_UPLOADED',
  LOG_ARCHIVE_UPLOAD_FAILED: 'LOG_ARCHIVE_UPLOAD_FAILED',
  LOG_ARCHIVE_DEAD_LETTERED: 'LOG_ARCHIVE_DEAD_LETTERED',
  LOG_ARCHIVE_DISK_PROTECTION_TRIGGERED: 'LOG_ARCHIVE_DISK_PROTECTION_TRIGGERED',
} as const;
export type StorageAuditAction = (typeof STORAGE_AUDIT_ACTIONS)[keyof typeof STORAGE_AUDIT_ACTIONS];
