export const STOCK_MOVEMENT_TYPES = {
  RECEIPT: 'receipt',
  SALE: 'sale',
  RETURN: 'return',
  ADJUSTMENT: 'adjustment',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  DAMAGE: 'damage',
  EXPIRY_WRITE_OFF: 'expiry_write_off',
  // KarienLabs manufactures its own stock — this distinguishes an Admin's
  // direct "Add Inventory" entry (own-manufactured, no supplier/PO involved)
  // from a supplier-sourced GRN receipt (`RECEIPT`) and from the separate
  // request/approve manual-adjustment workflow (`ADJUSTMENT`), so reporting
  // can tell the three apart without inspecting `referenceType`.
  MANUFACTURED: 'manufactured',
} as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[keyof typeof STOCK_MOVEMENT_TYPES];

export const PURCHASE_ORDER_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS];

export const STOCK_ADJUSTMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const STOCK_TRANSFER_STATUS = {
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const;

export const PURCHASE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CONVERTED: 'converted',
} as const;

export type PurchaseRequestStatus =
  (typeof PURCHASE_REQUEST_STATUS)[keyof typeof PURCHASE_REQUEST_STATUS];

export const BATCH_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  FLAGGED: 'flagged',
  EXHAUSTED: 'exhausted',
} as const;

export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS];
