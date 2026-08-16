import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Prompt 24 Part 29 — application-level field encryption for third-party
 * credentials an admin sets via the Configuration engine (e.g. Razorpay
 * `keySecret`/`webhookSecret`, Cloudinary `apiSecret`, AWS
 * `secretAccessKey`, SMTP `smtpPassword`) rather than env vars.
 * `configuration.service.ts::getConfiguration`/`setConfiguration` is the
 * ONE chokepoint every namespace's reads/writes already flow through
 * (razorpay.client.ts, cloudinary.client.ts, shiprocket.client.ts, S3
 * config, etc. all call `getConfiguration(namespace)`), so encrypting
 * there is fully transparent to every existing caller — none of them need
 * to change.
 *
 * Deliberately NOT "encrypt everything" (Part 29's explicit warning) — only
 * fields whose NAME matches a known secret-shaped pattern are touched;
 * ordinary configuration (feature toggles, numeric tunables, display text)
 * is left as plain JSON exactly as before, since encrypting it would only
 * add cost with no confidentiality benefit and would make the
 * Configuration collection harder to read/debug for no reason.
 *
 * AES-256-GCM (authenticated encryption — Part 29's explicit recommendation):
 * each value gets its own random 12-byte IV, and the GCM auth tag is stored
 * alongside the ciphertext so tampering with a stored value is detected on
 * decrypt, not silently accepted. The key comes from `CONFIG_ENCRYPTION_KEY`
 * (env var only — Part 29: "never store encryption keys beside encrypted
 * values", and an env var is physically separate from the MongoDB document
 * that holds the ciphertext).
 */

const ENCRYPTED_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/** Field NAMES (not full paths — matched anywhere in the object tree) treated as secret-shaped and therefore encrypted at rest. Extend this list, never remove from it without a migration plan for already-encrypted values. */
const SENSITIVE_FIELD_NAMES = new Set([
  'keySecret',
  'webhookSecret',
  'apiSecret',
  'clientSecret',
  'secretAccessKey',
  'smtpPassword',
  'smtpPass',
  'privateKey',
  'authToken',
  'accountSecret',
]);

let cachedKey: Buffer | null | undefined; // undefined = not yet resolved, null = deliberately unconfigured
let warnedOnce = false;

/** Accepts either a base64 or hex-encoded 32-byte key (whichever `openssl rand -base64 32` / `-hex 32` produce). Returns `null` (not configured, or malformed — logged once, never thrown, so a bad key doesn't crash the whole app) rather than encrypting. */
function resolveKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  if (!env.CONFIG_ENCRYPTION_KEY) {
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn(
        'CONFIG_ENCRYPTION_KEY is not set — third-party credentials saved via the admin Configuration UI ' +
          '(Razorpay/Cloudinary/AWS/SMTP secrets, etc.) will be stored in MongoDB in PLAINTEXT. ' +
          'Set CONFIG_ENCRYPTION_KEY (32 bytes, base64 or hex) to enable at-rest encryption for these fields.',
      );
    }
    cachedKey = null;
    return null;
  }

  for (const encoding of ['base64', 'hex'] as const) {
    try {
      const buf = Buffer.from(env.CONFIG_ENCRYPTION_KEY, encoding);
      if (buf.length === 32) {
        cachedKey = buf;
        return cachedKey;
      }
    } catch {
      // try the next encoding
    }
  }

  logger.error('CONFIG_ENCRYPTION_KEY is set but is not a valid 32-byte base64/hex key — encryption is DISABLED.');
  cachedKey = null;
  return null;
}

/** Test-only escape hatch — `resolveKey()` caches its result for the process lifetime (deliberately, to avoid re-parsing the key on every Configuration read/write), which means tests that toggle `env.CONFIG_ENCRYPTION_KEY` between scenarios need a way to force a fresh resolution. Never called from production code. */
export function __resetKeyCacheForTesting(): void {
  cachedKey = undefined;
  warnedOnce = false;
}

function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptString(encoded: string, key: Buffer): string {
  const raw = Buffer.from(encoded.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

function walk(value: unknown, transform: (fieldName: string, fieldValue: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, transform));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_FIELD_NAMES.has(key) && typeof val === 'string' && val.length > 0) {
        result[key] = transform(key, val);
      } else {
        result[key] = walk(val, transform);
      }
    }
    return result;
  }
  return value;
}

/** Called from `setConfiguration` before persisting. No-ops (returns `value` unchanged) when `CONFIG_ENCRYPTION_KEY` isn't configured — see `resolveKey`'s warning. */
export function encryptSensitiveConfigFields(value: unknown): unknown {
  const key = resolveKey();
  if (!key) return value;
  return walk(value, (_field, plaintext) => (isEncrypted(plaintext) ? plaintext : encryptString(plaintext, key)));
}

/**
 * Called from `getConfiguration` after reading. Fully transparent to every
 * caller regardless of whether encryption is enabled: an unencrypted
 * (legacy, or written while `CONFIG_ENCRYPTION_KEY` was unset) plaintext
 * value passes through untouched; an encrypted value is decrypted back to
 * plaintext. If the key is missing/wrong at DECRYPT time (e.g. the key was
 * rotated without a migration), the field is replaced with `''` (empty
 * string, keeping the same type every caller already expects) rather
 * than throwing and taking down the whole configuration read — a payment
 * integration failing closed with "credential unavailable" is far safer
 * than crashing every request that happens to read ANY Configuration
 * namespace.
 */
export function decryptSensitiveConfigFields(value: unknown): unknown {
  return walk(value, (field, storedValue) => {
    if (!isEncrypted(storedValue)) return storedValue;
    const key = resolveKey();
    if (!key) {
      logger.error(`Cannot decrypt configuration field "${field}" — CONFIG_ENCRYPTION_KEY is not set or invalid.`);
      return '';
    }
    try {
      return decryptString(storedValue, key);
    } catch (err) {
      logger.error({ err, field }, 'Failed to decrypt configuration field — wrong key or corrupted value.');
      return '';
    }
  });
}
