import { ACTOR_TYPES, FULFILLMENT_AUDIT_ACTIONS, ORDER_STATUS } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { NotFoundError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';

import { OrderModel } from './models/order.model';
import { isOrderFulfillmentEligible } from './order-fulfillment-eligibility.service';
import { updateOrderStatus } from './order.service';

/**
 * the per-order unit of work the automation queue drives
 * (order-fulfillment.worker.ts). Called for exactly one order at a time so
 * a crash/retry/duplicate-delivery only ever affects that one order (Part
 * 5/21), never a whole batch.
 *
 * Idempotent by construction, not by a separate flag: it re-reads the
 * order's CURRENT status and only performs whichever step(s) haven't
 * already happened —
 *   - PLACED   -> advances to CONFIRMED, then re-checks
 *   - CONFIRMED -> advances to PACKED (which — unchanged, Part 1 — is what
 *     already triggers invoice generation, see order.service.ts)
 *   - anything else (already PACKED+, or no longer eligible at all) -> no-op
 * So calling this twice for the same order, or resuming after a crash that
 * left the order sitting at CONFIRMED, always converges to the same PACKED
 * end state without ever throwing "invalid transition" or repeating a step
 * that already happened (Part 5/26/27).
 *
 * `isOrderFulfillmentEligible` gates ENTRY into this pipeline — it requires
 * `status === PLACED`, which is deliberately what stops the sweep from ever
 * discovering an order a second time. That same check must NOT block this
 * function from finishing a run that already got as far as CONFIRMED
 * (crash/retry recovery, Part 25/27) — a CONFIRMED order was already
 * validated eligible the moment it left PLACED, and `updateOrderStatus`'s
 * own transition-table + prescription-gate checks remain the authoritative
 * guard for the PACKED step regardless.
 */
export async function processOrderFulfillmentAutomation(orderId: string): Promise<void> {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) throw new NotFoundError('Order');

  if (order.status === ORDER_STATUS.PLACED) {
    const eligibility = await isOrderFulfillmentEligible(order);
    if (!eligibility.eligible) {
      // Not an error — the sweep's own query filter already narrows to
      // PLACED+CAPTURED orders, but eligibility is re-checked here anyway
      // (Part 4's "defense in depth" against a race between the sweep's
      // query and this job actually running — e.g. a cancellation, or a
      // prescription that still needs verification).
      logger.info({ orderId, reason: eligibility.reason }, 'Order skipped by automated fulfillment (not eligible)');
      return;
    }
  } else if (order.status !== ORDER_STATUS.CONFIRMED) {
    // Already PACKED or beyond (or CANCELLED/FAILED/etc.) — nothing left
    // for automation to do; a safe, silent no-op (Part 26).
    return;
  }

  try {
    let current = order.status;

    if (current === ORDER_STATUS.PLACED) {
      await updateOrderStatus(orderId, ORDER_STATUS.CONFIRMED, null, 'Automated fulfillment: payment confirmed, inventory committed');
      current = ORDER_STATUS.CONFIRMED;
    }

    if (current === ORDER_STATUS.CONFIRMED) {
      await updateOrderStatus(orderId, ORDER_STATUS.PACKED, null, 'Automated fulfillment: ready for invoice and shipment');
    }

    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      action: FULFILLMENT_AUDIT_ACTIONS.ORDER_AUTO_ADVANCED,
      resource: 'order',
      resourceId: orderId,
      after: { status: ORDER_STATUS.PACKED },
    });
  } catch (err) {
    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      action: FULFILLMENT_AUDIT_ACTIONS.ORDER_AUTO_ADVANCE_FAILED,
      resource: 'order',
      resourceId: orderId,
      result: 'failure',
      failureReason: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}
