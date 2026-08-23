/**
 * Part 22/23 — centralized, RECURSIVE sensitive-data masking.
 *
 * `config/logger.ts`'s pino `redact` option (kept, unchanged) only matches
 * a small number of FIXED/shallow path shapes reliably. This module is the
 * defense-in-depth complement for the case Part 22 explicitly calls out —
 * "do not rely only on developers remembering this" — any code that wants
 * to log an arbitrary, possibly deeply-nested object (a third-party API
 * request/response payload, a webhook body, a request body for debugging)
 * should pass it through `sanitizeForLogging()` first, which walks the
 * WHOLE object graph regardless of depth and masks any key that matches a
 * known-sensitive name, never just the top level.
 */

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwordhash',
  'otp',
  'code',
  'devonlycode',
  'token',
  'jwt',
  'secret',
  'apikey',
  'api_key',
  'accesskeyid',
  'accountnumber',
  'bankaccount',
  'cardnumber',
  'cvv',
  'authorization',
  'cookie',
  'signedurl',
  'presignedurl',
  'uploadurl',
  'downloadurl',
  'privatekey',
  'clientsecret',
  'webhooksecret',
  'razorpay_signature',
  'razorpaysecret',
  'shiprocketpassword',
  'keysecret',
  'prescriptioncontent',
  'documentcontent',
  'filebuffer',
];

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isBinaryLike(value: unknown): boolean {
  return Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer;
}

/**
 * Recursively masks sensitive fields in an arbitrary value before it's
 * handed to the logger. Also caps string length and strips binary/buffer
 * content (Part 23 — never log raw file bytes/multipart uploads) so a
 * stray large payload can't flood the log stream either.
 */
export function sanitizeForLogging(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (isBinaryLike(value)) {
    return '[BINARY_OMITTED]';
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value;
  }

  if (typeof value !== 'object') return value;

  if (depth >= MAX_DEPTH) return '[MAX_DEPTH_OMITTED]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : sanitizeForLogging(val, depth + 1);
  }
  return result;
}
