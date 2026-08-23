import { S3Client } from '@aws-sdk/client-s3';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';

/**
 * Backend-only AWS S3 client ( 15). Mirrors the existing
 * razorpay.client.ts / shiprocket.client.ts pattern: credentials resolved
 * from the `s3` Configuration namespace first (DB-configured, settable by
 * Super Admin — Part 28), falling back to env vars, cached in-memory.
 * Credentials never leave this file — every caller only ever gets a
 * constructed S3Client or resolved bucket/region strings back.
 */

interface S3Credentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  logRetentionDays: number;
  /** invoice/shipping-label retention (Part 19/37), separate from logRetentionDays above (a different prefix, a different sweep job). */
  documentRetentionDays: number;
  /** Overrides documentRetentionDays for invoices specifically, when set. Falls back to documentRetentionDays for backward compatibility with deployments that only ever configured the combined value. */
  invoiceRetentionDays: number | null;
  /** Overrides documentRetentionDays for shipping/return labels specifically, when set. Same fallback as invoiceRetentionDays. */
  labelRetentionDays: number | null;
  /** Admin-facing "Upload Invoice to S3" toggle — when false, invoices always use the Cloudinary fallback even if S3 credentials are configured. Defaults to true (preserves pre-existing implicit behavior). */
  uploadInvoiceToS3: boolean;
  /** Same as uploadInvoiceToS3, for shipping/return labels. */
  uploadLabelToS3: boolean;
  /** Same as uploadInvoiceToS3, for the log-archival pipeline (log-archival.scheduler.ts). Layered on top of the existing env.LOG_S3_ARCHIVAL_ENABLED kill switch — either one being off disables log S3 upload. */
  uploadLogsToS3: boolean;
  /** RUNBOOK (local dev) — MinIO endpoint override, e.g. http://minio:9000. Empty in production, see env.schema.ts. */
  endpoint: string;
}

const CREDENTIALS_CACHE_TTL_MS = 60_000;
let credentialsCache: { value: S3Credentials; expiresAt: number } | null = null;

function envCredentials(): S3Credentials {
  return {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    bucket: env.AWS_S3_BUCKET,
    logRetentionDays: env.AWS_S3_LOG_RETENTION_DAYS,
    documentRetentionDays: env.AWS_S3_DOCUMENT_RETENTION_DAYS,
    invoiceRetentionDays: null,
    labelRetentionDays: null,
    uploadInvoiceToS3: true,
    uploadLabelToS3: true,
    uploadLogsToS3: true,
    endpoint: env.AWS_S3_ENDPOINT,
  };
}

interface S3ConfigurationDbShape extends Partial<Omit<S3Credentials, 'uploadInvoiceToS3' | 'uploadLabelToS3' | 'uploadLogsToS3'>> {
  uploadInvoiceToS3?: boolean;
  uploadLabelToS3?: boolean;
  uploadLogsToS3?: boolean;
}

async function resolveCredentials(): Promise<S3Credentials> {
  const now = Date.now();
  if (credentialsCache && credentialsCache.expiresAt > now) return credentialsCache.value;

  let value = envCredentials();
  try {
    const dbConfig = (await getConfiguration('s3')) as S3ConfigurationDbShape;
    value = {
      region: dbConfig.region || value.region,
      accessKeyId: dbConfig.accessKeyId || value.accessKeyId,
      secretAccessKey: dbConfig.secretAccessKey || value.secretAccessKey,
      bucket: dbConfig.bucket || value.bucket,
      logRetentionDays: dbConfig.logRetentionDays || value.logRetentionDays,
      documentRetentionDays: dbConfig.documentRetentionDays || value.documentRetentionDays,
      invoiceRetentionDays: dbConfig.invoiceRetentionDays ?? null,
      labelRetentionDays: dbConfig.labelRetentionDays ?? null,
      // `?? ` (not `||`) — an explicit `false` from the DB must win, not be
      // treated as falsy-and-ignored the way `documentRetentionDays: 0` would be.
      uploadInvoiceToS3: dbConfig.uploadInvoiceToS3 ?? value.uploadInvoiceToS3,
      uploadLabelToS3: dbConfig.uploadLabelToS3 ?? value.uploadLabelToS3,
      uploadLogsToS3: dbConfig.uploadLogsToS3 ?? value.uploadLogsToS3,
      endpoint: dbConfig.endpoint || value.endpoint,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read s3 configuration from DB — falling back to env vars');
  }

  credentialsCache = { value, expiresAt: now + CREDENTIALS_CACHE_TTL_MS };
  return value;
}

export async function isS3Configured(): Promise<boolean> {
  const { accessKeyId, secretAccessKey, bucket, region } = await resolveCredentials();
  return Boolean(accessKeyId && secretAccessKey && bucket && region);
}

export async function getS3Bucket(): Promise<string> {
  return (await resolveCredentials()).bucket;
}

export async function getLogRetentionDays(): Promise<number> {
  return (await resolveCredentials()).logRetentionDays;
}

export async function getDocumentRetentionDays(): Promise<number> {
  return (await resolveCredentials()).documentRetentionDays;
}

/** Invoice-specific retention override; falls back to the combined documentRetentionDays when unset. */
export async function getInvoiceRetentionDays(): Promise<number> {
  const creds = await resolveCredentials();
  return creds.invoiceRetentionDays ?? creds.documentRetentionDays;
}

/** Shipping/return-label-specific retention override; falls back to the combined documentRetentionDays when unset. */
export async function getLabelRetentionDays(): Promise<number> {
  const creds = await resolveCredentials();
  return creds.labelRetentionDays ?? creds.documentRetentionDays;
}

/** Backend-enforced "Upload Invoice to S3" toggle — checked in addition to isS3Configured(), never merely a frontend display concern. */
export async function shouldUploadInvoiceToS3(): Promise<boolean> {
  return (await resolveCredentials()).uploadInvoiceToS3;
}

/** Same as shouldUploadInvoiceToS3, for shipping/return labels. */
export async function shouldUploadLabelToS3(): Promise<boolean> {
  return (await resolveCredentials()).uploadLabelToS3;
}

/** Same as shouldUploadInvoiceToS3, for the log-archival pipeline. */
export async function shouldUploadLogsToS3(): Promise<boolean> {
  return (await resolveCredentials()).uploadLogsToS3;
}

let client: S3Client | null = null;
let clientBuiltFor: string | null = null;

/**
 * Lazily constructed (same reasoning as getRazorpayClient/getShiprocketClient
 * equivalents) — never crashes process boot when S3 isn't configured yet;
 * only S3-dependent operations fail (with a safe error) until credentials
 * are set. Rebuilt when the resolved credentials change.
 */
export async function getS3Client(): Promise<S3Client> {
  const { region, accessKeyId, secretAccessKey, bucket, endpoint } = await resolveCredentials();
  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'S3 is not configured — set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET',
    );
  }
  const fingerprint = `${region}:${accessKeyId}:${bucket}:${endpoint}`;
  if (!client || clientBuiltFor !== fingerprint) {
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // RUNBOOK (local dev) — MinIO speaks the S3 API but only supports
      // path-style bucket addressing (http://host:9000/bucket/key), never
      // AWS's virtual-hosted-style (http://bucket.host/key); forcePathStyle
      // is only applied when an endpoint override is actually set, so real
      // AWS S3 in production is completely unaffected.
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    clientBuiltFor = fingerprint;
  }
  return client;
}
