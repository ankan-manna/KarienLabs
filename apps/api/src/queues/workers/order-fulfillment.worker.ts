import { Worker } from 'bullmq';

import { logger } from '../../config/logger';
import { createQueueConnection } from '../../config/redis';
import { runWithJobContext } from '../../config/request-context';
import { processOrderFulfillmentAutomation } from '../../modules/orders/order-fulfillment-automation.service';
import { QUEUE_NAMES, type OrderFulfillmentAutomationJobData } from '../queue';

/**
 * Prompt 27 — consumes the per-order jobs the automation sweep enqueues
 * (fulfillment-automation-sweep.job.ts). Concurrency > 1 is safe here for
 * the SAME reason the existing invoice/shipment workers already run at
 * concurrency 4/2: each job only ever touches its own single order, and
 * `processOrderFulfillmentAutomation` re-reads the order's live status and
 * only performs whatever transition hasn't already happened — two workers
 * (or two retried attempts) racing the SAME order both converge safely on
 * `updateOrderStatus`'s existing allowed-transition guard rather than
 * double-applying anything (Part 5/29).
 */
export function startOrderFulfillmentWorker(): Worker<OrderFulfillmentAutomationJobData> {
  const worker = new Worker<OrderFulfillmentAutomationJobData>(
    QUEUE_NAMES.ORDER_FULFILLMENT_AUTOMATION,
    async (job) =>
      runWithJobContext('order-fulfillment-automation', job.id, async () => {
        logger.info({ jobId: job.id, orderId: job.data.orderId }, 'Processing automated order fulfillment');
        await processOrderFulfillmentAutomation(job.data.orderId);
      }),
    { connection: createQueueConnection(), concurrency: 4 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Order fulfillment automation job completed'));
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'Order fulfillment automation job failed'),
  );

  return worker;
}
