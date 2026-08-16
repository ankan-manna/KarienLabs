import { logger } from '../../config/logger';
import { AuditLogModel } from '../../modules/audit/models/audit-log.model';
import { NotificationQueueModel } from '../../modules/notifications/models/notification-queue.model';

const AUDIT_LOG_RETENTION_DAYS = 365;
const STALE_QUEUE_ENTRY_DAYS = 30;

/**
 * VerificationToken and RefreshToken already self-expire via Mongo TTL indexes
 * (see their models), so they need no manual sweep. What's left with no
 * built-in expiry: audit logs beyond the retention window, and any
 * NotificationQueue stragglers (e.g. from a worker crash mid-job that never
 * reached the terminal FAILED state the notification worker normally sets).
 */
export async function runCleanupJob(): Promise<number> {
  const auditCutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - STALE_QUEUE_ENTRY_DAYS * 24 * 60 * 60 * 1000);

  const [auditResult, queueResult] = await Promise.all([
    AuditLogModel.deleteMany({ createdAt: { $lt: auditCutoff } }),
    NotificationQueueModel.deleteMany({ createdAt: { $lt: staleCutoff } }),
  ]);

  const total = auditResult.deletedCount + queueResult.deletedCount;
  if (total > 0) {
    logger.info(
      { auditLogsDeleted: auditResult.deletedCount, staleQueueEntriesDeleted: queueResult.deletedCount },
      'Cleanup job removed stale records',
    );
  }
  return total;
}
