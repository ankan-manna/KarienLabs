import { connectDatabase, disconnectDatabase } from './config/database';
import { flushLogsSync, logger } from './config/logger';
import { redis } from './config/redis';
import { flushPoolStatsLogSync, startPoolStatsSampler } from './integrations/logging/pool-stats.logger';
import { flushThirdPartyMetricsLogSync } from './integrations/logging/third-party-metrics.logger';
import { closePdfBrowser } from './integrations/pdf/pdf.service';
import { configureLogLifecycleRule } from './integrations/s3/storage.service';
import './models.registry';
import { startLogArchivalScheduler } from './queues/jobs/log-archival.scheduler';
import { scheduleMaintenanceJobs } from './queues/queue';
import { startInvoiceWorker } from './queues/workers/invoice.worker';
import { startMaintenanceWorker } from './queues/workers/maintenance.worker';
import { startNotificationWorker } from './queues/workers/notification.worker';
import { startOrderFulfillmentWorker } from './queues/workers/order-fulfillment.worker';
import { startShipmentWorker } from './queues/workers/shipment.worker';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  const invoiceWorker = startInvoiceWorker();
  const maintenanceWorker = startMaintenanceWorker();
  const notificationWorker = startNotificationWorker();
  const shipmentWorker = startShipmentWorker();
  const orderFulfillmentWorker = startOrderFulfillmentWorker();
  await scheduleMaintenanceJobs();
  // Prompt 15 Part 14 — idempotent; a no-op when S3 isn't configured, so
  // this never blocks worker boot in dev/self-disabled deployments.
  await configureLogLifecycleRule();

  // Prompt 18 Part 17/20/38 — this process's OWN local logs/pool-stats
  // (see log-archival.scheduler.ts for why this runs per-process).
  const stopLogArchival = startLogArchivalScheduler();
  startPoolStatsSampler();

  logger.info('Worker process started');

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down worker`);
    stopLogArchival();
    await invoiceWorker.close();
    await maintenanceWorker.close();
    await notificationWorker.close();
    await shipmentWorker.close();
    await orderFulfillmentWorker.close();
    await closePdfBrowser();
    await disconnectDatabase();
    await redis.quit();
    flushLogsSync();
    flushThirdPartyMetricsLogSync();
    flushPoolStatsLogSync();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start worker:', err);
  process.exit(1);
});
