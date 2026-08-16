/**
 * Prompt 16 — named audit actions for the return/replacement/refund
 * lifecycle, mirroring INVOICE_AUDIT_ACTIONS/SHIPMENT_AUDIT_ACTIONS/
 * STORAGE_AUDIT_ACTIONS: specific action strings for recordAudit() instead
 * of the generic 'create'/'update' verbs return.service.ts used before.
 */
export const RETURN_AUDIT_ACTIONS = {
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_REJECTED: 'RETURN_REJECTED',
  RETURN_SHIPMENT_CREATED: 'RETURN_SHIPMENT_CREATED',
  RETURN_SHIPMENT_CREATION_FAILED: 'RETURN_SHIPMENT_CREATION_FAILED',
  RETURN_PICKED_UP: 'RETURN_PICKED_UP',
  RETURN_RECEIVED: 'RETURN_RECEIVED',
  RETURN_INSPECTED: 'RETURN_INSPECTED',
  INVENTORY_RETURNED_TO_STOCK: 'INVENTORY_RETURNED_TO_STOCK',
  INVENTORY_QUARANTINED: 'INVENTORY_QUARANTINED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_SUCCESS: 'REFUND_SUCCESS',
  REFUND_FAILED: 'REFUND_FAILED',
  REPLACEMENT_APPROVED: 'REPLACEMENT_APPROVED',
  REPLACEMENT_CREATED: 'REPLACEMENT_CREATED',
  REPLACEMENT_CREATION_FAILED: 'REPLACEMENT_CREATION_FAILED',
} as const;
export type ReturnAuditAction = (typeof RETURN_AUDIT_ACTIONS)[keyof typeof RETURN_AUDIT_ACTIONS];

/**
 * Notification event keys (Part 45) — prepared for the EXISTING notification
 * architecture (enqueueNotification's templateKey), not a new provider.
 * return.service.ts only ever passes these strings as `templateKey`; it does
 * not know or care whether email/SMS/WhatsApp ends up sending them.
 */
/**
 * RET-01 (docs/DEVELOPMENT_TASKS.md) — default reason vocabulary + reason-
 * keyed return window. Admin-configurable via the `returns` Configuration
 * namespace (return.service.ts reads `returnWindowDaysByReason`, falling
 * back to DEFAULT_RETURN_WINDOW_DAYS_BY_REASON below when unset) — this is
 * the fallback/seed, not a hardcoded ceiling the config can't override
 * (Part 2/4: "do not hardcode... if the existing configuration system
 * supports them").
 */
export const RETURN_REASONS = {
  DAMAGED: 'damaged',
  WRONG_PRODUCT: 'wrong_product',
  EXPIRED_NEAR_EXPIRY: 'expired_near_expiry',
  MISSING_ITEM: 'missing_item',
  QUALITY_ISSUE: 'quality_issue',
  CUSTOMER_PREFERENCE: 'customer_preference',
  OTHER: 'other',
} as const;
export type ReturnReason = (typeof RETURN_REASONS)[keyof typeof RETURN_REASONS];

/** Published policy (RET-01): 2 days for damaged-package/missing-item claims, 7 days for everything else. */
export const DEFAULT_RETURN_WINDOW_DAYS_BY_REASON: Record<ReturnReason, number> = {
  damaged: 2,
  missing_item: 2,
  wrong_product: 7,
  expired_near_expiry: 7,
  quality_issue: 7,
  customer_preference: 7,
  other: 7,
};
export const DEFAULT_RETURN_WINDOW_DAYS = 7;

export const RETURN_NOTIFICATION_EVENTS = {
  RETURN_REQUESTED: 'return_requested',
  RETURN_APPROVED: 'return_approved',
  RETURN_REJECTED: 'return_rejected',
  RETURN_PICKED_UP: 'return_picked_up',
  RETURN_RECEIVED: 'return_received',
  REFUND_PROCESSING: 'refund_processing',
  REFUND_SUCCESS: 'refund_success',
  REFUND_FAILED: 'refund_failed',
  REPLACEMENT_APPROVED: 'replacement_approved',
  REPLACEMENT_SHIPPED: 'replacement_shipped',
  REPLACEMENT_DELIVERED: 'replacement_delivered',
} as const;
