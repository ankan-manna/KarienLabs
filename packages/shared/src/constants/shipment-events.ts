/**
 * Prompt 14 — named audit actions for the Shiprocket/shipment fulfillment
 * layer, mirroring INVOICE_AUDIT_ACTIONS (Prompt 13) / CATALOG_AUDIT_ACTIONS
 * (Prompt 12): specific, meaningful action strings recorded via the existing
 * `recordAudit()` (audit.service.ts) actor-context pipeline rather than the
 * older generic 'create'/'update'/'delete' verbs.
 */
export const SHIPMENT_AUDIT_ACTIONS = {
  ADMIN_CREATED_SHIPMENT: 'ADMIN_CREATED_SHIPMENT',
  SYSTEM_CREATED_SHIPROCKET_ORDER: 'SYSTEM_CREATED_SHIPROCKET_ORDER',
  SHIPMENT_CREATION_FAILED: 'SHIPMENT_CREATION_FAILED',
  SYSTEM_ASSIGNED_AWB: 'SYSTEM_ASSIGNED_AWB',
  SYSTEM_GENERATED_LABEL: 'SYSTEM_GENERATED_LABEL',
  SYSTEM_PROCESSED_SHIPMENT_WEBHOOK: 'SYSTEM_PROCESSED_SHIPMENT_WEBHOOK',
  ADMIN_RETRIED_SHIPMENT: 'ADMIN_RETRIED_SHIPMENT',
  ADMIN_DOWNLOADED_LABEL: 'ADMIN_DOWNLOADED_LABEL',
  SYSTEM_UPDATED_TRACKING: 'SYSTEM_UPDATED_TRACKING',
} as const;

export type ShipmentAuditAction =
  (typeof SHIPMENT_AUDIT_ACTIONS)[keyof typeof SHIPMENT_AUDIT_ACTIONS];

/**
 * External Shiprocket courier status strings -> internal SHIPMENT_STATUS
 * (Part 23: "create a clear mapping layer", not a second state machine).
 * Keys are Shiprocket's documented `shipment_status`/`current_status` values
 * lower-cased for a case-insensitive lookup; unmapped/unknown values are
 * deliberately NOT applied (see shiprocket-fulfillment.service.ts) rather
 * than guessed at.
 */
export const SHIPROCKET_STATUS_MAP: Record<string, string> = {
  'pickup scheduled': 'ready_for_dispatch',
  'pickup generated': 'ready_for_dispatch',
  'pickup queued': 'ready_for_dispatch',
  'ready to ship': 'ready_for_dispatch',
  'shipped': 'picked_up',
  'picked up': 'picked_up',
  'in transit': 'in_transit',
  'out for delivery': 'out_for_delivery',
  'delivered': 'delivered',
  'undelivered': 'failed',
  'delivery failed': 'failed',
  'cancelled': 'failed',
  'rto initiated': 'rto',
  'rto in transit': 'rto',
  'rto delivered': 'rto',
  'rto': 'rto',
};
