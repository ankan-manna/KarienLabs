import { ACTOR_TYPES, FULFILLMENT_AUDIT_ACTIONS, ORDER_STATUS, PAYMENT_STATUS } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { recordAudit } from '../../modules/audit/audit.service';
import { getFulfillmentConfig } from '../../modules/orders/fulfillment-config.service';
import { OrderModel } from '../../modules/orders/models/order.model';
import { isOrderFulfillmentEligible } from '../../modules/orders/order-fulfillment-eligibility.service';
import { ConfigurationModel } from '../../modules/platform/models/configuration.model';
import { enqueueOrderFulfillmentAutomation } from '../queue';

/**
 * Prompt 27 Part 25/29 — deliberately a SEPARATE Configuration namespace
 * from the admin-editable `fulfillment` one (fulfillment-config.service.ts).
 * `fulfillment`'s value shape is strictly whitelisted (fulfillment-config.util.ts)
 * and replaced wholesale on every admin save — internal bookkeeping like
 * "when did the sweep last run" has no business living in the same
 * document an admin's save could otherwise clobber. Never exposed through
 * the generic `/configuration/:namespace` admin API (nothing reads or
 * writes it from there), purely an internal lock/cursor.
 */
const SWEEP_STATE_NAMESPACE = 'fulfillment_sweep_state';

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Part 29 — the distributed-locking mechanism: an atomic, conditional
 * MongoDB update (not a new Redis-lock library, not an in-memory flag —
 * Part 29 explicitly says to reuse an existing mechanism). Two worker
 * processes/replicas racing this at the same moment can never both "claim"
 * the same due window: MongoDB itself resolves the race — the loser either
 * finds no matching document (already claimed by the winner a moment
 * earlier) or, on a bootstrap race, hits the namespace's unique-index
 * duplicate-key error, which is treated identically to "lost the race" —
 * the same catch-and-treat-as-safe pattern already used for
 * Order.paymentId / Shipment.shiprocketOrderId elsewhere in this codebase.
 */
async function tryClaimSweep(dueBeforeMs: number): Promise<boolean> {
  try {
    const claimed = await ConfigurationModel.findOneAndUpdate(
      {
        namespace: SWEEP_STATE_NAMESPACE,
        $or: [
          { 'value.lastSweepStartedAt': { $exists: false } },
          { 'value.lastSweepStartedAt': { $lt: new Date(dueBeforeMs) } },
        ],
      },
      { $set: { 'value.lastSweepStartedAt': new Date() } },
      { upsert: true, new: true },
    );
    return Boolean(claimed);
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }
}

async function markSweepCompleted(orderCount: number): Promise<void> {
  await ConfigurationModel.updateOne(
    { namespace: SWEEP_STATE_NAMESPACE },
    { $set: { 'value.lastSweepCompletedAt': new Date(), 'value.lastSweepOrderCount': orderCount } },
  );
}

/**
 * Prompt 27 Part 2/3/24/25 — runs frequently (every 15 min, see queue.ts's
 * MAINTENANCE_JOB_NAMES comment) but only does real work once the
 * Configuration-driven ~6-hour/±30-min window has actually elapsed
 * (tryClaimSweep above). When due, walks PLACED+CAPTURED orders in
 * indexed, paginated batches (never loading the whole collection — Part
 * 24/48) and enqueues ONE independently-retryable job per eligible order
 * (Part 3/21) rather than doing any per-order work inline here.
 */
export async function runFulfillmentAutomationSweepJob(): Promise<number> {
  const config = await getFulfillmentConfig();
  if (!config.automationEnabled || !config.orderAdvancementEnabled) {
    return 0;
  }

  const dueBeforeMs =
    Date.now() - (config.cronIntervalHours * 60 - config.toleranceMinutes) * 60 * 1000;
  const claimed = await tryClaimSweep(dueBeforeMs);
  if (!claimed) return 0;

  await recordAudit({
    actorId: null,
    actorType: ACTOR_TYPES.BACKGROUND_JOB,
    action: FULFILLMENT_AUDIT_ACTIONS.AUTOMATION_SWEEP_STARTED,
    resource: 'fulfillment_automation',
  });

  let enqueuedCount = 0;
  let cursor: unknown = null;

  try {
    for (;;) {
      const filter: Record<string, unknown> = {
        status: ORDER_STATUS.PLACED,
        paymentStatus: PAYMENT_STATUS.CAPTURED,
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      };
      const page = await OrderModel.find(filter)
        .select('_id status paymentStatus prescriptionRequired prescriptionVerified')
        .sort({ _id: 1 })
        .limit(config.batchSize)
        .lean();

      if (page.length === 0) break;

      for (const order of page) {
        const eligibility = await isOrderFulfillmentEligible(order);
        if (eligibility.eligible) {
          await enqueueOrderFulfillmentAutomation(String(order._id));
          enqueuedCount += 1;
        }
      }

      cursor = page[page.length - 1]._id;
      if (page.length < config.batchSize) break;
    }
  } catch (err) {
    logger.error({ err, enqueuedCount }, 'Fulfillment automation sweep failed partway through');
    // Whatever was already enqueued above stays durably queued in Redis
    // regardless of this error — only the REMAINING, not-yet-reached pages
    // are missed by this run; the next due sweep (state-based, Part 25)
    // will find and enqueue them same as any other still-PLACED order.
    throw err;
  }

  await markSweepCompleted(enqueuedCount);
  await recordAudit({
    actorId: null,
    actorType: ACTOR_TYPES.BACKGROUND_JOB,
    action: FULFILLMENT_AUDIT_ACTIONS.AUTOMATION_SWEEP_COMPLETED,
    resource: 'fulfillment_automation',
    metadata: { ordersEnqueued: enqueuedCount },
  });

  logger.info({ enqueuedCount }, 'Fulfillment automation sweep completed');
  return enqueuedCount;
}
