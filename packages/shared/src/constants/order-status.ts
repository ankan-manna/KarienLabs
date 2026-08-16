/**
 * Fulfillment lifecycle for an order. Payment state is tracked separately on
 * `order.paymentStatus` (see PAYMENT_STATUS below) — "Payment Pending" / "Payment
 * Success" from the Prompt 7 spec map onto that existing field rather than being
 * duplicated here, since an order is only ever created (checkout()) after the cart
 * has already resolved to a definite order record; payment capture/failure is then
 * layered on top via the payments module and doesn't change the *order* lifecycle
 * by itself except via the FAILED status below (payment failure -> order fails ->
 * stock is compensated, mirroring cancelOrder()).
 */
export const ORDER_STATUS = {
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  PACKED: 'packed',
  READY_FOR_DISPATCH: 'ready_for_dispatch',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled', 'failed'],
  confirmed: ['packed', 'cancelled'],
  packed: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'returned'],
  out_for_delivery: ['delivered', 'returned'],
  delivered: ['returned'],
  returned: ['refunded'],
  refunded: [],
  cancelled: [],
  failed: ['cancelled'],
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
