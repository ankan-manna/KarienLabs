import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { logThirdPartyApiCall } from '../logging/third-party-metrics.logger';

import { getLogRetentionDays, getS3Bucket, getS3Client, isS3Configured } from './s3.client';

/**
 * Prompt 15 Part 1 — the ONE centralized storage abstraction every document
 * flow (invoice PDFs, shipping labels, log bundles) goes through. No module
 * is allowed to import `@aws-sdk/client-s3` directly except this file and
 * `s3.client.ts` — see invoice.service.ts / shiprocket-fulfillment.service.ts /
 * log-retention.worker.ts, all of which call the functions below instead.
 */

const DEFAULT_PRESIGNED_TTL_SECONDS = 300; // 5 minutes — short-lived per Part 8/9/25.

export interface UploadDocumentInput {
  buffer: Buffer;
  objectKey: string;
  contentType: string;
}

export interface UploadDocumentResult {
  bucket: string;
  objectKey: string;
  fileSize: number;
}

/** Centralized upload — deterministic `objectKey` (Part 3/20) makes retries idempotent: re-uploading the same key simply overwrites the same object, it never creates a second one. */
export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  const startedAt = Date.now();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
        Body: input.buffer,
        ContentType: input.contentType,
        // Bucket stays fully private (Part 25) — no ACL grants public access;
        // access is exclusively via short-lived presigned URLs generated below.
      }),
    );
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'PutObject',
      method: 'PUT',
      durationMs: Date.now() - startedAt,
      success: true,
    });
  } catch (err) {
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'PutObject',
      method: 'PUT',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: 'Upload failed',
    });
    throw err;
  }
  return { bucket, objectKey: input.objectKey, fileSize: input.buffer.byteLength };
}

/** Short-lived, backend-authorized download link (Part 8/9/10) — the ONLY way a document's bytes ever reach a browser. Callers MUST validate resource ownership/permission BEFORE calling this. */
export async function getPresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds: number = DEFAULT_PRESIGNED_TTL_SECONDS,
): Promise<string> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
    expiresIn: expiresInSeconds,
  });
}

const DEFAULT_UPLOAD_TTL_SECONDS = 300; // 5 minutes — long enough for a mobile-network image upload, short enough not to leak a standing write credential.

/**
 * Prompt 17 Part 9/10/47 — a short-lived, backend-authorized PUT link so the
 * browser can upload a prescription file DIRECTLY to S3 (never proxied
 * through the API, never touching Cloudinary) without the frontend ever
 * holding real AWS credentials. Callers MUST validate the file (mime/
 * extension/size — see storage.util.ts's assertValidPrescriptionFile) and
 * resource ownership BEFORE issuing this URL, exactly like
 * getPresignedDownloadUrl's read-side equivalent.
 */
export async function getPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresInSeconds: number = DEFAULT_UPLOAD_TTL_SECONDS,
): Promise<string> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteObject(objectKey: string): Promise<void> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  const startedAt = Date.now();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'DeleteObject',
      method: 'DELETE',
      durationMs: Date.now() - startedAt,
      success: true,
    });
  } catch (err) {
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'DeleteObject',
      method: 'DELETE',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: 'Delete failed',
    });
    throw err;
  }
}

export async function objectExists(objectKey: string): Promise<boolean> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  const startedAt = Date.now();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'HeadObject',
      method: 'HEAD',
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return true;
  } catch {
    logThirdPartyApiCall({
      service: 's3',
      endpoint: 'HeadObject',
      method: 'HEAD',
      durationMs: Date.now() - startedAt,
      success: false,
    });
    return false;
  }
}

/** Lists every object key under a prefix (paginated) — used by the app-level log-retention safety-net sweep (Part 14/15) to find candidates for deletion when the S3 lifecycle rule can't be configured. */
export async function listObjectKeysUnderPrefix(prefix: string): Promise<{ key: string; lastModified: Date }[]> {
  const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
  const results: { key: string; lastModified: Date }[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key && obj.LastModified) results.push({ key: obj.Key, lastModified: obj.LastModified });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return results;
}

export async function verifyBucketAccess(): Promise<boolean> {
  try {
    const [client, bucket] = await Promise.all([getS3Client(), getS3Bucket()]);
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'S3 bucket access check failed');
    return false;
  }
}

/**
 * Part 14 — the PREFERRED retention mechanism: an S3 Lifecycle rule that
 * expires everything under `logs/` after N days, enforced by AWS itself
 * rather than relying entirely on application code. Idempotent — safe to
 * call on every boot (PutBucketLifecycleConfiguration replaces the whole
 * rule set, so this always converges to the same single rule rather than
 * accumulating duplicates). A no-op (returns false) when S3 isn't
 * configured, so it never blocks boot in dev/self-disabled deployments.
 */
export async function configureLogLifecycleRule(): Promise<boolean> {
  if (!(await isS3Configured())) return false;
  try {
    const [client, bucket, retentionDays] = await Promise.all([
      getS3Client(),
      getS3Bucket(),
      getLogRetentionDays(),
    ]);
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'medcommerce-log-retention',
              Status: 'Enabled',
              // Part 12/13/43 — CRITICAL: scoped to ONLY the log prefix, never
              // the bucket root, so invoices/shipping-labels/prescriptions/
              // catalog documents are never touched by this 20-day rule.
              Filter: { Prefix: env.LOG_S3_PREFIX },
              Expiration: { Days: retentionDays },
            },
          ],
        },
      }),
    );
    logger.info({ retentionDays }, 'S3 log-retention lifecycle rule configured');
    return true;
  } catch (error) {
    // Most commonly: the IAM credentials lack s3:PutLifecycleConfiguration.
    // Never fatal — the app-level sweep (log-retention.worker.ts) is the
    // documented safety net for exactly this case (Part 14).
    logger.warn({ err: error }, 'Could not configure S3 log-retention lifecycle rule — falling back to the application-level sweep only');
    return false;
  }
}

export { isS3Configured };
