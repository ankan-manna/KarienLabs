import { invalidateMaintenanceModeCache } from '../../middlewares/maintenance-mode.middleware';
import { invalidateRateLimitConfigCache } from '../../middlewares/rate-limit-config.util';
import { decryptSensitiveConfigFields, encryptSensitiveConfigFields } from '../../utils/field-encryption.util';
import { recordAudit } from '../audit/audit.service';

import { ConfigurationModel } from './models/configuration.model';

/**
 * Prompt 24 Part 29 — the ONE chokepoint every namespace's config reads/
 * writes already flow through (razorpay.client.ts, cloudinary.client.ts,
 * shiprocket.client.ts, S3/SMTP config, ...), so encrypting specific
 * secret-shaped field names here (field-encryption.util.ts) is fully
 * transparent to every existing caller — decrypted plaintext is returned
 * here exactly as before; only what's physically stored in MongoDB changes.
 */
export async function getConfiguration(namespace: string) {
  const config = await ConfigurationModel.findOne({ namespace }).lean();
  return decryptSensitiveConfigFields(config?.value ?? {});
}

export async function setConfiguration(namespace: string, value: unknown, actorId: string) {
  const before = await ConfigurationModel.findOne({ namespace }).select('value').lean();
  const encryptedValue = encryptSensitiveConfigFields(value);
  const config = await ConfigurationModel.findOneAndUpdate(
    { namespace },
    { value: encryptedValue, updatedBy: actorId },
    { upsert: true, new: true },
  ).lean();

  if (namespace === 'global') await invalidateMaintenanceModeCache();
  if (namespace === 'rateLimiting') await invalidateRateLimitConfigCache();

  // Part 30/54 — audit the DECRYPTED before/after value (the same shape an
  // admin already sees/sets via the API), never the raw ciphertext blob;
  // AuditLogModel itself is not exempt from Part 42's "never log secrets"
  // rule just because THIS specific write is a secret-bearing namespace —
  // recordAudit's own field-name-based redaction (audit.service.ts) still
  // applies on top of this.
  await recordAudit({
    actorId,
    action: 'config_change',
    resource: 'configuration',
    resourceId: null,
    before: { namespace, value: decryptSensitiveConfigFields(before?.value ?? null) },
    after: { namespace, value },
  });

  return decryptSensitiveConfigFields(config.value);
}
