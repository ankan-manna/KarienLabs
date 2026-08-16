/**
 * Prompt 27 — named audit actions for the automated post-payment fulfillment
 * pipeline (the 6-hour sweep that advances an eligible paid order, plus the
 * document-retention/regeneration lifecycle), mirroring SHIPMENT_AUDIT_ACTIONS
 * / INVOICE_AUDIT_ACTIONS / STORAGE_AUDIT_ACTIONS. Most of the actual work
 * (invoice generation, Shiprocket order/AWB/label) already had its own audit
 * actions from earlier prompts and is unchanged here — these cover only the
 * NEW automation-specific events: the sweep itself, an order being advanced
 * by it, and a document being expired/regenerated.
 */
export const FULFILLMENT_AUDIT_ACTIONS = {
  AUTOMATION_SWEEP_STARTED: 'AUTOMATION_SWEEP_STARTED',
  AUTOMATION_SWEEP_COMPLETED: 'AUTOMATION_SWEEP_COMPLETED',
  ORDER_AUTO_ADVANCED: 'ORDER_AUTO_ADVANCED',
  ORDER_AUTO_ADVANCE_FAILED: 'ORDER_AUTO_ADVANCE_FAILED',
  DOCUMENT_EXPIRED: 'DOCUMENT_EXPIRED',
  DOCUMENT_REGENERATED_AFTER_EXPIRY: 'DOCUMENT_REGENERATED_AFTER_EXPIRY',
} as const;

export type FulfillmentAuditAction =
  (typeof FULFILLMENT_AUDIT_ACTIONS)[keyof typeof FULFILLMENT_AUDIT_ACTIONS];
