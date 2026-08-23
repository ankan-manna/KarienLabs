import { UnrecoverableError, Worker } from 'bullmq';

import { logger } from '../../config/logger';
import { createQueueConnection } from '../../config/redis';
import { runWithJobContext } from '../../config/request-context';
import { getFulfillmentConfig } from '../../modules/orders/fulfillment-config.service';
import {
  assignAwbForShipment,
  createShiprocketOrderForOrder,
  fetchAndStoreLabel,
  isPermanentFulfillmentFailure,
} from '../../modules/orders/shiprocket-fulfillment.service';
import { QUEUE_NAMES, type ShipmentFulfillmentJobData } from '../queue';

/**
 * Drives an order through Shiprocket order-creation + AWB assignment +
 * ( 27 Part 17) label fetch/store, attributed to the SYSTEM actor
 * (Part 27 — never the last admin who touched the order). Every step this
 * calls is independently idempotent (see shiprocket-fulfillment.service.ts),
 * so a retried/duplicate job is always safe to re-run.
 *
 * Label fetch used to be lazy-only (the very first admin click on "download
 * label" was what actually generated it — see shipment.controller.ts). It's
 * proactively generated here now, immediately after AWB assignment
 * succeeds, exactly matching Part 17's documented workflow ("Shiprocket
 * Order Created -> Shipment Created -> Label Requested -> Label Available
 * -> Download -> Upload to S3 -> Persist metadata") instead of waiting on a
 * human. Gated by `labelAutomationEnabled` (Part 30/31) — when off, the
 * admin's on-demand download path (unchanged) still works exactly as
 * before.
 */
export function startShipmentWorker(): Worker<ShipmentFulfillmentJobData> {
  const worker = new Worker<ShipmentFulfillmentJobData>(
    QUEUE_NAMES.SHIPMENT_FULFILLMENT,
    async (job) =>
      runWithJobContext('shipment-fulfillment', job.id, async () => {
        logger.info({ jobId: job.id, orderId: job.data.orderId }, 'Creating Shiprocket shipment');
        const config = await getFulfillmentConfig();
        if (!config.automationEnabled || !config.shippingAutomationEnabled) {
          logger.info({ orderId: job.data.orderId }, 'Shipping automation disabled — skipping');
          return;
        }

        // Bugfix (Order/Shiprocket/Invoice) Part 4 — `createShiprocketOrderForOrder`/
        // `assignAwbForShipment` mark genuine data/precondition problems
        // (missing shipping address, order not packed yet, invoice not
        // generated yet, no fulfilling warehouse — see
        // shiprocket-fulfillment.service.ts's `markPermanent`) as
        // `permanent`. Retrying the SAME job for one of these is pure waste:
        // the outcome can only change if the order transitions state, and
        // that transition independently enqueues a NEW job when it happens.
        // Thrown as BullMQ's own `UnrecoverableError` so the job is marked
        // failed immediately, without burning through the queue's configured
        // `attempts`/backoff — genuine transient failures (Shiprocket
        // network/5xx/timeout, thrown as plain errors below) are untouched
        // and keep the existing retry behavior.
        try {
          const shipment = await createShiprocketOrderForOrder(job.data.orderId, { id: null });
          const withAwb = shipment.awbCode
            ? shipment
            : await assignAwbForShipment(String(shipment._id), { id: null });

          if (config.labelAutomationEnabled && withAwb.awbCode && !withAwb.labelUrl) {
            try {
              await fetchAndStoreLabel(String(withAwb._id), { id: null });
            } catch (error) {
              // Non-fatal — AWB is already assigned and the shipment is
              // trackable; label generation is independently retryable (the
              // admin's on-demand download path, or a future sweep pass)
              // without re-doing anything above (Part 27/33).
              logger.warn({ shipmentId: String(withAwb._id), err: error }, 'Automated label generation failed');
            }
          }
        } catch (error) {
          if (isPermanentFulfillmentFailure(error)) {
            const reason = error instanceof Error ? error.message : 'Permanent fulfillment precondition failure';
            logger.error(
              { orderId: job.data.orderId, jobId: job.id, reason },
              'Shipment fulfillment permanently failed — not retrying (data/precondition problem)',
            );
            throw new UnrecoverableError(reason);
          }
          throw error;
        }
      }),
    { connection: createQueueConnection(), concurrency: 2 },
  );

  worker.on('completed', (job) =>
    logger.info({ jobId: job.id, orderId: job.data.orderId }, 'Shipment fulfillment job completed'),
  );
  worker.on('failed', (job, err) =>
    // Part 8 — `job.data.orderId` added: the job id alone isn't enough to
    // find the affected order from the log without a second BullMQ lookup;
    // `attemptsMade`/`opts.attempts` let a human immediately tell "still has
    // retries left" from "this was the final attempt" without cross-
    // referencing the queue config.
    logger.error(
      {
        jobId: job?.id,
        orderId: job?.data.orderId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        err,
      },
      'Shipment fulfillment job failed',
    ),
  );

  return worker;
}
