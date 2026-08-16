import { Worker } from 'bullmq';

import { logger } from '../../config/logger';
import { createQueueConnection } from '../../config/redis';
import { runWithJobContext } from '../../config/request-context';
import { runCleanupJob } from '../jobs/cleanup.job';
import { runCouponExpirySweepJob } from '../jobs/coupon-expiry.job';
import { runDocumentRetentionSweepJob } from '../jobs/document-retention-sweep.job';
import { runExpiryAlertJob } from '../jobs/expiry-alert.job';
import { runFulfillmentAutomationSweepJob } from '../jobs/fulfillment-automation-sweep.job';
import { runLogRetentionSweepJob } from '../jobs/log-retention-sweep.job';
import { runLowStockAlertJob } from '../jobs/low-stock-alert.job';
import { runPrescriptionExpirySweepJob } from '../jobs/prescription-expiry-sweep.job';
import { runWeeklySalesReportJob } from '../jobs/weekly-report.job';
import { MAINTENANCE_JOB_NAMES, QUEUE_NAMES } from '../queue';

const HANDLERS: Record<string, () => Promise<number>> = {
  [MAINTENANCE_JOB_NAMES.LOW_STOCK_ALERT]: runLowStockAlertJob,
  [MAINTENANCE_JOB_NAMES.EXPIRY_ALERT]: runExpiryAlertJob,
  [MAINTENANCE_JOB_NAMES.COUPON_EXPIRY_SWEEP]: runCouponExpirySweepJob,
  [MAINTENANCE_JOB_NAMES.CLEANUP_STALE_RECORDS]: runCleanupJob,
  [MAINTENANCE_JOB_NAMES.WEEKLY_SALES_REPORT]: runWeeklySalesReportJob,
  [MAINTENANCE_JOB_NAMES.LOG_RETENTION_SWEEP]: runLogRetentionSweepJob,
  [MAINTENANCE_JOB_NAMES.PRESCRIPTION_EXPIRY_SWEEP]: runPrescriptionExpirySweepJob,
  [MAINTENANCE_JOB_NAMES.FULFILLMENT_AUTOMATION_SWEEP]: runFulfillmentAutomationSweepJob,
  [MAINTENANCE_JOB_NAMES.DOCUMENT_RETENTION_SWEEP]: runDocumentRetentionSweepJob,
};

export function startMaintenanceWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.MAINTENANCE,
    async (job) => {
      const handler = HANDLERS[job.name];
      if (!handler) {
        logger.warn({ jobName: job.name }, 'No handler registered for maintenance job');
        return;
      }
      await runWithJobContext(job.name, job.id, async () => {
        const affected = await handler();
        logger.info({ jobName: job.name, affected }, 'Maintenance job completed');
      });
    },
    { connection: createQueueConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) =>
    logger.error({ jobName: job?.name, err }, 'Maintenance job failed'),
  );

  return worker;
}
