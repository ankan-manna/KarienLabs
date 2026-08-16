import { S3Client } from '@aws-sdk/client-s3';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';

/**
 * Backend-only AWS S3 client (Prompt 15). Mirrors the existing
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
  /** Prompt 27 — invoice/shipping-label retention (Part 19/37), separate from logRetentionDays above (a different prefix, a different sweep job). */
  documentRetentionDays: number;
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
    endpoint: env.AWS_S3_ENDPOINT,
  };
}

async function resolveCredentials(): Promise<S3Credentials> {
  const now = Date.now();
  if (credentialsCache && credentialsCache.expiresAt > now) return credentialsCache.value;

  let value = envCredentials();
  try {
    const dbConfig = (await getConfiguration('s3')) as Partial<S3Credentials>;
    value = {
      region: dbConfig.region || value.region,
      accessKeyId: dbConfig.accessKeyId || value.accessKeyId,
      secretAccessKey: dbConfig.secretAccessKey || value.secretAccessKey,
      bucket: dbConfig.bucket || value.bucket,
      logRetentionDays: dbConfig.logRetentionDays || value.logRetentionDays,
      documentRetentionDays: dbConfig.documentRetentionDays || value.documentRetentionDays,
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
