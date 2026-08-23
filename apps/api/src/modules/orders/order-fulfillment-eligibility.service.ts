import { ORDER_STATUS, PAYMENT_STATUS } from '@medcommerce/shared';

import { getPrescriptionConfig } from '../customers/prescription-config.service';

import type { OrderDocument } from './models/order.model';

export interface FulfillmentEligibilityResult {
  eligible: boolean;
  /** Human-readable reason, only ever populated when `eligible` is false — used for logging/audit, never shown to a customer. */
  reason?: string;
}

export type EligibilityOrderInput = Pick<
  OrderDocument,
  'status' | 'paymentStatus' | 'prescriptionRequired' | 'prescriptionVerified'
>;

/**
 * Part 4 — THE canonical "is this order allowed into automated
 * fulfillment right now" check, reused by BOTH the sweep's coarse DB query
 * filter (order-fulfillment-automation.service.ts) and the per-order job's
 * own re-check immediately before acting (defense in depth against a race
 * — e.g. a return/cancellation landing between the sweep's query and the
 * job actually running).
 *
 * Deliberately reuses the EXACT state names  2/3 already established
 * — never invents parallel terminology:
 *   - `status === PLACED` — the only status a NEWLY-paid, not-yet-advanced
 *     order can be in ( 2: an Order only ever comes into existence
 *     with `paymentStatus: CAPTURED` in the first place — see
 *     order.service.ts's finalizeOrderFromDraft). An order already at
 *     CONFIRMED/PACKED/beyond has already entered (or finished) this same
 *     pipeline — Part 26 "must not reprocess" — and CANCELLED/FAILED/
 *     REFUNDED orders must never enter it at all.
 *   - `paymentStatus === CAPTURED` — belt-and-suspenders alongside the
 *     status check above; a PLACED order should always be CAPTURED under
 *     the prepaid-only architecture, but this is the one place that
 *     invariant is worth re-asserting rather than assumed.
 *   - the prescription gate mirrors order.service.ts's updateOrderStatus
 *     inline check EXACTLY (same config flags, same condition) so
 *     automated fulfillment can never advance an order past the point a
 *     manual admin PACKED transition would itself have blocked.
 */
export async function isOrderFulfillmentEligible(
  order: EligibilityOrderInput,
): Promise<FulfillmentEligibilityResult> {
  if (order.status !== ORDER_STATUS.PLACED) {
    return { eligible: false, reason: `order status is "${order.status}", not "${ORDER_STATUS.PLACED}"` };
  }
  if (order.paymentStatus !== PAYMENT_STATUS.CAPTURED) {
    return { eligible: false, reason: `payment status is "${order.paymentStatus}", not captured` };
  }
  if (order.prescriptionRequired && !order.prescriptionVerified) {
    const prescriptionConfig = await getPrescriptionConfig();
    if (prescriptionConfig.managementEnabled && prescriptionConfig.orderBlockingEnabled) {
      return { eligible: false, reason: 'prescription required and not yet verified' };
    }
  }
  return { eligible: true };
}
