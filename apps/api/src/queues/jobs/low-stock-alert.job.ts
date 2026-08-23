import { logger } from '../../config/logger';
import { batchRepository } from '../../modules/inventory/batch.repository';
import { notifyAdmins } from '../../modules/notifications/notification.service';

/**
 * fix — this job previously wrote directly to
 * `NotificationQueueModel.insertMany(...)` with a hardcoded fake recipient
 * address, bypassing `enqueueNotificationDispatch` entirely. That meant
 * these rows sat in Mongo forever, NEVER actually processed (the worker
 * only reacts to BullMQ jobs, not by polling the queue collection) — a
 * real, silent notification failure. Routed through the central
 * `notifyAdmins()` (Part 1/12) now: one notification per REAL admin/
 * super_admin user, actually dispatched.
 */
export async function runLowStockAlertJob(): Promise<number> {
  const lowStockItems = await batchRepository.findLowStock();
  if (lowStockItems.length === 0) return 0;

  let recipients = 0;
  for (const item of lowStockItems) {
    recipients += await notifyAdmins({
      templateKey: 'low_stock_alert',
      data: {
        productName: item.productName,
        sku: item.sku,
        totalAvailable: item.totalAvailable,
        reorderLevel: item.reorderLevel,
      },
    });
  }

  logger.info({ items: lowStockItems.length, recipients }, 'Low-stock alert job dispatched');
  return lowStockItems.length;
}
