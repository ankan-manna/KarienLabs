import { Worker } from 'bullmq';

import { logger } from '../../config/logger';
import { createQueueConnection } from '../../config/redis';
import { runWithJobContext } from '../../config/request-context';
import { generateInvoiceForOrder } from '../../modules/invoices/invoice.service';
import { enqueueShipmentFulfillment, QUEUE_NAMES, type GenerateInvoiceJobData } from '../queue';

/**
 * Invoice PDF generation runs here, off the request/response cycle — Puppeteer
 * renders are too slow (and too resource-heavy) to run inline in the payment
 * webhook/verify handlers that trigger it. See payment.service.ts for the two
 * call sites (client-side verify and the Razorpay webhook).
 */
export function startInvoiceWorker(): Worker<GenerateInvoiceJobData> {
  const worker = new Worker<GenerateInvoiceJobData>(
    QUEUE_NAMES.INVOICE_GENERATION,
    async (job) =>
      runWithJobContext('invoice-generation', job.id, async () => {
        logger.info({ jobId: job.id, orderId: job.data.orderId }, 'Generating invoice PDF');
        await generateInvoiceForOrder(job.data.orderId);

        // the documented Invoice Generated -> Shiprocket Order
        // dependency (Part 12/14): shipment creation is only ever kicked off
        // AFTER the authoritative invoice exists, never before/instead of it.
        // Failures here (e.g. Shiprocket not configured) don't roll back the
        // invoice — they're surfaced via the shipment's own lastError/audit
        // trail and are safely retryable from the admin shipment UI.
        try {
          await enqueueShipmentFulfillment(job.data.orderId);
        } catch (error) {
          logger.warn(
            { orderId: job.data.orderId, error },
            'Failed to enqueue shipment fulfillment after invoice generation',
          );
        }
      }),
    { connection: createQueueConnection(), concurrency: 4 },
  );

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Invoice job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Invoice job failed'));

  return worker;
}
