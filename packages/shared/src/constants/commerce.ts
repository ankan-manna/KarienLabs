export const COUPON_TYPES = {
  FLAT: 'flat',
  PERCENTAGE: 'percentage',
} as const;

export type CouponType = (typeof COUPON_TYPES)[keyof typeof COUPON_TYPES];

/**
 * extends the pre-existing REQUESTED/APPROVED/REJECTED/PICKED_UP/
 * RECEIVED/REFUNDED machine (do not remove any of those — RECEIVED and
 * REFUNDED already have real historical data and code depending on them)
 * with an explicit inspection gate (RECEIVED -> INSPECTED) and a second
 * terminal resolution (REPLACED, alongside the existing REFUNDED) so
 * "received" no longer implicitly means "sellable and refunded" — see
 * return.service.ts's inspectReturn/resolveReturnRefund/resolveReturnReplacement.
 */
export const RETURN_STATUS = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PICKED_UP: 'picked_up',
  RECEIVED: 'received',
  INSPECTED: 'inspected',
  REFUNDED: 'refunded',
  REPLACED: 'replaced',
} as const;

export type ReturnStatus = (typeof RETURN_STATUS)[keyof typeof RETURN_STATUS];

/** RET-02's documented QC outcome vocabulary (docs/DEVELOPMENT_TASKS.md) — deliberately not a longer invented list. */
export const QC_RESULT = {
  SELLABLE: 'sellable',
  DAMAGED: 'damaged',
  EXPIRED: 'expired',
  TAMPERED: 'tampered',
} as const;
export type QcResult = (typeof QC_RESULT)[keyof typeof QC_RESULT];

export const RETURN_RESOLUTION_TYPE = {
  REFUND: 'refund',
  REPLACEMENT: 'replacement',
} as const;
export type ReturnResolutionType =
  (typeof RETURN_RESOLUTION_TYPE)[keyof typeof RETURN_RESOLUTION_TYPE];

/** Part 31 — the one authoritative Return state machine; return.service.ts's transitionReturn() rejects anything not listed here. */
export const RETURN_STATUS_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['rejected', 'picked_up'],
  rejected: [],
  picked_up: ['received'],
  received: ['inspected'],
  inspected: ['refunded', 'replaced'],
  refunded: [],
  replaced: [],
};

export const CANCELLATION_STATUS = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const REFUND_STATUS = {
  INITIATED: 'initiated',
  PROCESSED: 'processed',
  FAILED: 'failed',
} as const;

export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

export const SHIPMENT_STATUS = {
  PENDING: 'pending',
  READY_FOR_DISPATCH: 'ready_for_dispatch',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RTO: 'rto',
} as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUS)[keyof typeof SHIPMENT_STATUS];

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  SENT: 'sent',
} as const;

/** Reviews are auto-published on submission (no moderation queue in this build) — `HIDDEN` exists so admin tooling can moderate later without a schema change. */
export const REVIEW_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];
