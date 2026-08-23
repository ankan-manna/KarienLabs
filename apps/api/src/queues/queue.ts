import { Queue } from 'bullmq';

import { createQueueConnection } from '../config/redis';

export const QUEUE_NAMES = {
  INVOICE_GENERATION: 'invoice-generation',
  MAINTENANCE: 'maintenance',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  SHIPMENT_FULFILLMENT: 'shipment-fulfillment',
  // one job per eligible order, enqueued by the maintenance
  // sweep below (FULFILLMENT_AUTOMATION_SWEEP) rather than doing the actual
  // per-order work inside the cron/sweep itself (Part 3/21: "do not create
  // a single huge cron request that processes thousands of orders
  // synchronously" — each order gets its own independently retryable job).
  ORDER_FULFILLMENT_AUTOMATION: 'order-fulfillment-automation',
} as const;

export interface GenerateInvoiceJobData {
  orderId: string;
}

export const invoiceQueue = new Queue<GenerateInvoiceJobData>(QUEUE_NAMES.INVOICE_GENERATION, {
  connection: createQueueConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export async function enqueueInvoiceGeneration(orderId: string): Promise<void> {
  await invoiceQueue.add(QUEUE_NAMES.INVOICE_GENERATION, { orderId });
}

export interface DispatchNotificationJobData {
  notificationQueueId: string;
}

/**
 * The previously-missing piece: `enqueueNotification()` (notification.service.ts)
 * only ever wrote a NotificationQueue document — nothing consumed it, so queued
 * notifications accumulated forever unsent. This queue is what the worker
 * process (`worker.ts` -> notification.worker.ts) actually drains, mirroring
 * the invoice-generation pattern above.
 */
export const notificationDispatchQueue = new Queue<DispatchNotificationJobData>(
  QUEUE_NAMES.NOTIFICATION_DISPATCH,
  {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  },
);

export async function enqueueNotificationDispatch(notificationQueueId: string): Promise<void> {
  await notificationDispatchQueue.add(QUEUE_NAMES.NOTIFICATION_DISPATCH, { notificationQueueId });
}

export interface ShipmentFulfillmentJobData {
  orderId: string;
}

/**
 * Shiprocket order creation runs here, off the request/response
 * cycle, same reasoning as invoice-generation above (external API calls are
 * too slow/unreliable to run inline). Enqueued from invoice.worker.ts right
 * after a successful invoice generation (Part 12/14's documented
 * Invoice Generated -> Shiprocket Order dependency), and from the admin
 * retry endpoint (shipment.controller.ts).
 */
export const shipmentFulfillmentQueue = new Queue<ShipmentFulfillmentJobData>(
  QUEUE_NAMES.SHIPMENT_FULFILLMENT,
  {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  },
);

export async function enqueueShipmentFulfillment(orderId: string): Promise<void> {
  await shipmentFulfillmentQueue.add(QUEUE_NAMES.SHIPMENT_FULFILLMENT, { orderId });
}

export interface OrderFulfillmentAutomationJobData {
  orderId: string;
}

/**
 * advances ONE eligible paid order through
 * PLACED -> CONFIRMED -> PACKED (order-fulfillment-automation.service.ts),
 * which — unchanged — is exactly what already triggers invoice generation
 * (order.service.ts's updateOrderStatus), which — unchanged — is exactly
 * what already chains into Shiprocket order/AWB/label creation
 * (invoice.worker.ts -> shipment.worker.ts). This queue's only job is
 * automating the TRIGGER; none of the actual fulfillment work is
 * reimplemented here.
 */
export const orderFulfillmentAutomationQueue = new Queue<OrderFulfillmentAutomationJobData>(
  QUEUE_NAMES.ORDER_FULFILLMENT_AUTOMATION,
  {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  },
);

export async function enqueueOrderFulfillmentAutomation(orderId: string): Promise<void> {
  await orderFulfillmentAutomationQueue.add(
    QUEUE_NAMES.ORDER_FULFILLMENT_AUTOMATION,
    { orderId },
    // Part 5/26 — BullMQ job-id uniqueness as a SECOND, cheap idempotency
    // layer on top of the per-order eligibility re-check inside the worker
    // itself: two sweep ticks that both decide the same order is due
    // (e.g. one sweep's batch page overlapping a retried page) can never
    // both enqueue a live/waiting duplicate for the same order — BullMQ
    // silently no-ops the second `add()` for an already-present job id.
    { jobId: `order-fulfillment-${orderId}` },
  );
}

export const MAINTENANCE_JOB_NAMES = {
  LOW_STOCK_ALERT: 'low-stock-alert',
  EXPIRY_ALERT: 'expiry-alert',
  COUPON_EXPIRY_SWEEP: 'coupon-expiry-sweep',
  CLEANUP_STALE_RECORDS: 'cleanup-stale-records',
  WEEKLY_SALES_REPORT: 'weekly-sales-report',
  // Introduced a LOG_BATCH_UPLOAD entry here as a single
  // centralized BullMQ job; replaced it with a PER-PROCESS
  // in-process scheduler (queues/jobs/log-archival.scheduler.ts) — a
  // single worker-only BullMQ job structurally can't reach the `api`
  // container's separate local filesystem in this Docker topology. The
  // S3-side retention SWEEP below is unaffected (it only touches S3, never
  // local disk) and correctly stays centralized here.
  LOG_RETENTION_SWEEP: 'log-retention-sweep',
   // expires verified prescriptions past their configured validity window.
  PRESCRIPTION_EXPIRY_SWEEP: 'prescription-expiry-sweep',
  // ticks frequently (every 15 min, see scheduleMaintenanceJobs
  // below) but only actually does anything once the configurable
  // ~6-hour/±30-min window has elapsed since the last run (Part 2/3/25) —
  // the frequent tick + internal self-pacing check is deliberately safer
  // than baking a 6-hour BullMQ `repeat` pattern directly, since it makes
  // the interval genuinely Configuration-driven (no worker restart needed
  // to pick up an admin's changed interval) and naturally self-heals after
  // a missed tick (Part 25: "the next cycle MUST pick it up").
  FULFILLMENT_AUTOMATION_SWEEP: 'fulfillment-automation-sweep',
  // Part 19/37 — S3 retention sweep for invoice/label documents,
  // mirroring LOG_RETENTION_SWEEP's existing daily-safety-net pattern.
  DOCUMENT_RETENTION_SWEEP: 'document-retention-sweep',
} as const;

export const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, {
  connection: createQueueConnection(),
  defaultJobOptions: { removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } },
});

/** Registers the daily repeatable jobs — idempotent (BullMQ dedupes by job id + repeat pattern), safe to call on every worker boot. */
export async function scheduleMaintenanceJobs(): Promise<void> {
  const dailyAt3am = '0 3 * * *';
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.LOW_STOCK_ALERT,
    {},
    { repeat: { pattern: dailyAt3am } },
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.EXPIRY_ALERT,
    {},
    { repeat: { pattern: dailyAt3am } },
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.COUPON_EXPIRY_SWEEP,
    {},
    { repeat: { pattern: '0 0 * * *' } },
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.CLEANUP_STALE_RECORDS,
    {},
    { repeat: { pattern: '30 3 * * *' } },
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.WEEKLY_SALES_REPORT,
    {},
    { repeat: { pattern: '0 6 * * 1' } }, // Monday 6am
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.LOG_RETENTION_SWEEP,
    {},
    { repeat: { pattern: '15 3 * * *' } }, // daily — safety net behind the S3 lifecycle rule
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.PRESCRIPTION_EXPIRY_SWEEP,
    {},
    { repeat: { pattern: '45 3 * * *' } }, // daily
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.FULFILLMENT_AUTOMATION_SWEEP,
    {},
    { repeat: { pattern: '*/15 * * * *' } }, // every 15 min — see MAINTENANCE_JOB_NAMES comment for why
  );
  await maintenanceQueue.add(
    MAINTENANCE_JOB_NAMES.DOCUMENT_RETENTION_SWEEP,
    {},
    { repeat: { pattern: '0 4 * * *' } }, // daily
  );
}
