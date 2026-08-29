import { z } from 'zod';

/**
 * Canonical env contract for the API. Loaded once at boot (see apps/api/src/config/env.ts);
 * the process exits immediately if any required var is missing/malformed rather than
 * failing later on first use.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1),

  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(30),
  REFRESH_TOKEN_COOKIE_NAME: z.string().default('mc_refresh_token'),

  // webhookSecret, apiSecret, smtpPassword, ...) within admin-configurable
  // Configuration documents (apps/api/src/utils/field-encryption.util.ts) —
  // third-party credentials an admin sets via the DB-backed Configuration
  // UI rather than env vars would otherwise sit in MongoDB in plaintext.
  // Optional/self-disabling (like every other integration secret in this
  // schema) so existing deployments boot unchanged; when unset, affected
  // values are stored in plaintext exactly as before and a startup warning
  // is logged — see config/env.ts. Must be a 32-byte key, base64 or hex
  // encoded, generated with e.g. `openssl rand -base64 32`.
  CONFIG_ENCRYPTION_KEY: z.string().optional().default(''),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('no-reply@medcommerce.example.com'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

 
  // deployments boot unchanged; the feature self-disables (see
  // apps/api/src/modules/auth/google-auth.service.ts) whenever the client
  // id/secret aren't set, regardless of the `googleAdminLogin.enabled` config flag.
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),


  // self-disabling pattern as Google OAuth above and Razorpay before it) so
  // existing deployments boot unchanged; the integration reports itself as
  // "not configured" (see integrations/shiprocket/shiprocket.client.ts)
  // rather than crashing, until an admin sets these (env or the `shiprocket`
  // Configuration namespace — DB config wins, mirroring razorpay.client.ts).
  SHIPROCKET_EMAIL: z.string().optional().default(''),
  SHIPROCKET_PASSWORD: z.string().optional().default(''),
  SHIPROCKET_BASE_URL: z.string().optional().default('https://apiv2.shiprocket.in/v1/external'),
  SHIPROCKET_PICKUP_LOCATION: z.string().optional().default(''),
  SHIPROCKET_WEBHOOK_TOKEN: z.string().optional().default(''),


  // pattern as Shiprocket/Google/Razorpay above: left empty/optional so
  // existing deployments boot unchanged; invoice/label uploads fall back to
  // the pre-existing Cloudinary path (see storage.service.ts) until these
  // are set (env or the `s3` Configuration namespace — DB config wins).
  AWS_REGION: z.string().optional().default(''),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_S3_BUCKET: z.string().optional().default(''),
  // RUNBOOK (local dev) — S3-compatible endpoint override for MinIO (or any
  // other non-AWS S3-compatible provider). Left empty in production/staging
  // so the AWS SDK talks to real AWS S3 exactly as before; when set, the S3
  // client is built with `endpoint` + `forcePathStyle: true` (MinIO doesn't
  // support AWS's virtual-hosted-style bucket URLs), see s3.client.ts. This
  // is purely a transport-level switch — every caller of storage.service.ts
  // (invoice/label/log upload) is completely unaware which provider is live.
  AWS_S3_ENDPOINT: z.string().optional().default(''),
  // Business requirement (Part 14): application logs older than this are
  // deleted — via an S3 lifecycle rule primarily, with an app-level sweep as
  // a safety net (see storage.service.ts's configureLogLifecycleRule /
  // log-retention.worker.ts). Does NOT apply to invoices/labels/audit.
  AWS_S3_LOG_RETENTION_DAYS: z.coerce.number().optional().default(20),

  // many days (the DB Invoice/Shipment/Document records are NEVER deleted —
  // see document-retention-sweep.job.ts); overridable at runtime via the
  // `s3` Configuration namespace's `documentRetentionDays`, same pattern as
  // AWS_S3_LOG_RETENTION_DAYS/logRetentionDays above.
  AWS_S3_DOCUMENT_RETENTION_DAYS: z.coerce.number().optional().default(30),


  // INFRASTRUCTURE/deployment settings (Part 26), never Admin business
  // configuration — they live here in env, not in the Configuration engine.
  // Default rotation stays 6 hours and default retention stays 20 days
  // regardless of deployment (Part 54); only the mechanics (timezone,
  // directory, worker cadence, archival on/off) are environment-tunable.
  LOG_TIMEZONE: z.string().optional().default('UTC'),
  LOG_ROTATION_HOURS: z.coerce.number().optional().default(6),
  LOG_DIRECTORY: z.string().optional().default(''),
  LOG_S3_PREFIX: z.string().optional().default('logs/'),
  // Explicit true/false (not z.coerce.boolean(), which treats the STRING
  // "false" as truthy) — an operator setting LOG_S3_ARCHIVAL_ENABLED=false
  // must actually disable archival, not silently no-op.
  LOG_S3_ARCHIVAL_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  LOG_ARCHIVAL_WORKER_INTERVAL_MINUTES: z.coerce.number().optional().default(15),
  LOG_MAX_PENDING_ARCHIVES: z.coerce.number().optional().default(500),
  LOG_UPLOAD_RETRY_LIMIT: z.coerce.number().optional().default(8),
  // Local-disk safety valve, independent of S3 ever succeeding: a
  // dead-lettered archive (exhausted LOG_UPLOAD_RETRY_LIMIT retries) or one
  // created while S3 archival is disabled/unconfigured has no other path
  // off local disk, so without a hard ceiling it accumulates forever.
  // Never applied to a file still within its retry backoff window — only to
  // ones that have either given up or were never going anywhere. Default
  // exceeds AWS_S3_LOG_RETENTION_DAYS's own 20-day default so a working S3
  // pipeline always evicts an object from the bucket before this local
  // fallback would ever delete its last unsent copy.
  LOG_LOCAL_MAX_RETENTION_DAYS: z.coerce.number().optional().default(30),
  LOG_POOL_STATS_INTERVAL_MINUTES: z.coerce.number().optional().default(5),
  // Part 5 — single, deployment-fixed tenant code (never trusted from the
  // frontend/request). Kept distinct from any business identifier; exists
  // purely so the logging context shape already carries a `tenant` field a
  // future genuine multi-tenant model can populate without a logger redesign.
  TENANT_CODE: z.string().optional().default('default'),
});

export type Env = z.infer<typeof envSchema>;
