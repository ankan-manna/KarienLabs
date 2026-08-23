import { s3ConfigSchema } from '@medcommerce/shared';

import { invalidateMaintenanceModeCache } from '../../middlewares/maintenance-mode.middleware';
import { invalidateRateLimitConfigCache } from '../../middlewares/rate-limit-config.util';
import { ValidationError } from '../../utils/app-error';
import { decryptSensitiveConfigFields, encryptSensitiveConfigFields } from '../../utils/field-encryption.util';
import { recordAudit } from '../audit/audit.service';

import { ConfigurationModel } from './models/configuration.model';

/**
 * Per-namespace shape validation, applied on write only (existing stored
 * documents from before a namespace had a schema are read back unchanged —
 * this never retroactively invalidates data, only new writes). Most
 * namespaces still have no schema here and keep the pre-existing
 * accept-any-object behavior; add an entry as each namespace's shape gets
 * hardened, same pattern as env.schema.ts already does for process env vars.
 */
const NAMESPACE_SCHEMAS: Partial<Record<string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }>> = {
  s3: s3ConfigSchema,
};

/**
 * Part 29 — the ONE chokepoint every namespace's config reads/
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
  const schema = NAMESPACE_SCHEMAS[namespace];
  if (schema) {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(`Invalid configuration for namespace "${namespace}"`, result.error);
    }
  }

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
