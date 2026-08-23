import { logger } from '../../config/logger';
import { batchRepository } from '../../modules/inventory/batch.repository';
import { notifyAdmins } from '../../modules/notifications/notification.service';

const EXPIRY_WARNING_WINDOW_DAYS = 30;

/** fix — same `insertMany`-bypasses-dispatch bug as low-stock-alert.job.ts, same fix. */
export async function runExpiryAlertJob(): Promise<number> {
  const nearExpiryBatches = await batchRepository.findNearExpiry(EXPIRY_WARNING_WINDOW_DAYS);
  if (nearExpiryBatches.length === 0) return 0;

  let recipients = 0;
  for (const batch of nearExpiryBatches) {
    recipients += await notifyAdmins({
      templateKey: 'batch_near_expiry',
      data: {
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantityAvailable: batch.quantityAvailable,
      },
    });
  }

  logger.info({ items: nearExpiryBatches.length, recipients }, 'Expiry alert job dispatched');
  return nearExpiryBatches.length;
}
