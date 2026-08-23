/**
 * RETURN_AUDIT_ACTIONS/SHIPMENT_AUDIT_ACTIONS/INVOICE_AUDIT_ACTIONS: specific
 * action strings for recordAudit() instead of relying purely on the generic
 * auditPlugin change-tracking prescription.service.ts used before this.
 */
export const PRESCRIPTION_AUDIT_ACTIONS = {
  PRESCRIPTION_UPLOADED: 'PRESCRIPTION_UPLOADED',
  PRESCRIPTION_UPLOAD_FAILED: 'PRESCRIPTION_UPLOAD_FAILED',
  PRESCRIPTION_VIEWED: 'PRESCRIPTION_VIEWED',
  PRESCRIPTION_VERIFIED: 'PRESCRIPTION_VERIFIED',
  PRESCRIPTION_REJECTED: 'PRESCRIPTION_REJECTED',
  PRESCRIPTION_REUPLOADED: 'PRESCRIPTION_REUPLOADED',
  PRESCRIPTION_EXPIRED: 'PRESCRIPTION_EXPIRED',
  PRESCRIPTION_CANCELLED: 'PRESCRIPTION_CANCELLED',
  PRESCRIPTION_REUSED: 'PRESCRIPTION_REUSED',
  ORDER_PRESCRIPTION_VERIFIED: 'ORDER_PRESCRIPTION_VERIFIED',
  PRESCRIPTION_CONFIG_CHANGED: 'PRESCRIPTION_CONFIG_CHANGED',
  PRESCRIPTION_FEATURE_ENABLED: 'PRESCRIPTION_FEATURE_ENABLED',
  PRESCRIPTION_FEATURE_DISABLED: 'PRESCRIPTION_FEATURE_DISABLED',
} as const;
export type PrescriptionAuditAction =
  (typeof PRESCRIPTION_AUDIT_ACTIONS)[keyof typeof PRESCRIPTION_AUDIT_ACTIONS];

/**
 * Part 27 — structured rejection reasons (configuration-driven vocabulary
 * consumed by the admin review UI; the actual free-text `rejectionReason`
 * field still accepts admin-authored detail, this is just the offered list).
 */
export const PRESCRIPTION_REJECTION_REASONS = {
  UNREADABLE: 'unreadable',
  INVALID_DOCUMENT: 'invalid_document',
  MISSING_INFORMATION: 'missing_information',
  EXPIRED: 'expired',
  WRONG_PATIENT: 'wrong_patient',
  WRONG_PRODUCT: 'wrong_product',
  OTHER: 'other',
} as const;
export type PrescriptionRejectionReason =
  (typeof PRESCRIPTION_REJECTION_REASONS)[keyof typeof PRESCRIPTION_REJECTION_REASONS];
