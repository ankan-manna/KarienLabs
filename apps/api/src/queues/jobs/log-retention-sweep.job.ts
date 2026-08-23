import { ACTOR_TYPES, STORAGE_AUDIT_ACTIONS } from '@medcommerce/shared';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getLogRetentionDays, isS3Configured } from '../../integrations/s3/s3.client';
import { deleteObject, listObjectKeysUnderPrefix } from '../../integrations/s3/storage.service';
import { isPastRetention } from '../../integrations/s3/storage.util';
import { recordAudit } from '../../modules/audit/audit.service';

/**
 * Part 14 — SAFETY NET only. The primary retention mechanism is
 * the S3 bucket lifecycle rule configured by configureLogLifecycleRule()
 * (storage.service.ts), enforced by AWS itself. This sweep exists purely
 * for deployments where the IAM credentials lack
 * s3:PutLifecycleConfiguration (so the lifecycle rule couldn't be applied)
 * — it walks the `logs/` prefix and deletes objects past the configured
 * retention window using ordinary DeleteObject calls. Scoped strictly to
 * the `logs/` prefix — invoices/shipping-labels/audit records are never
 * touched by this job (Part 15/16).
 */
export async function runLogRetentionSweepJob(): Promise<number> {
  if (!(await isS3Configured())) return 0;

  const retentionDays = await getLogRetentionDays();
  const objects = await listObjectKeysUnderPrefix(env.LOG_S3_PREFIX);
  const now = new Date();

  let deleted = 0;
  for (const obj of objects) {
    if (!isPastRetention(obj.lastModified, retentionDays, now)) continue;
    try {
      await deleteObject(obj.key);
      deleted += 1;
    } catch (error) {
      logger.error({ key: obj.key, err: error }, 'Failed to delete expired log object during retention sweep');
    }
  }

  if (deleted > 0) {
    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      action: STORAGE_AUDIT_ACTIONS.LOG_RETENTION_SWEEP_RAN,
      resource: 'log',
      metadata: { objectsDeleted: deleted, retentionDays },
    });
  }
  return deleted;
}
