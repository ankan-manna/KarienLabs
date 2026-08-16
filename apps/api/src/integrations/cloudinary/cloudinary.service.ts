import { logger } from '../../config/logger';
import { logThirdPartyApiCall } from '../logging/third-party-metrics.logger';

import { getCloudinaryClient } from './cloudinary.client';

// Prompt (Order/Shiprocket/Invoice/Image bugfix) Part 6 — `return_evidence`
// (Prompt 16 Part 3/33, customer return-photo uploads) is already accepted
// by uploads.routes.ts's Zod schema but was missing from this type, which
// meant `ensureUploadPreset` below would never have provisioned it.
export type UploadPreset =
  | 'product_thumbnail'
  | 'prescription_secure'
  | 'cms_media'
  | 'profile_picture'
  | 'return_evidence';

interface SignatureRequest {
  preset: UploadPreset;
  folder: string;
}

interface SignaturePayload {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadPreset: UploadPreset;
}

/** In-process cache of presets already confirmed to exist — avoids a Cloudinary Admin API round-trip on every signature request once a preset is known-good. */
const confirmedPresets = new Set<string>();

/**
 * Part 6 root cause: `/uploads/signature` only validates OUR OWN signing
 * math (credentials + HMAC) — it has no way to know whether the
 * `upload_preset` it just signed actually exists on the Cloudinary account.
 * A signed upload that references a non-existent preset is rejected by
 * Cloudinary itself ("Upload preset not found") at the browser's direct
 * POST, by which point our own endpoint has already returned 200 — exactly
 * the "200 from /uploads/signature does not mean the upload will succeed"
 * gap this prompt calls out. Fixed at the root: ensure the preset exists
 * (idempotent get-or-create) before ever handing out a signature for it,
 * rather than adding a second upload mechanism or silently swallowing the
 * eventual Cloudinary-side failure.
 */
async function ensureUploadPreset(
  cloudinary: Awaited<ReturnType<typeof getCloudinaryClient>>,
  name: string,
): Promise<void> {
  if (confirmedPresets.has(name)) return;
  const startedAt = Date.now();
  try {
    await cloudinary.api.upload_preset(name);
    logThirdPartyApiCall({
      service: 'cloudinary',
      endpoint: 'upload_preset:get',
      method: 'GET',
      durationMs: Date.now() - startedAt,
      success: true,
    });
    confirmedPresets.add(name);
  } catch (err) {
    // The Cloudinary Node SDK nests the real API error under `.error`, not
    // directly on the caught object — e.g. `{ error: { message, http_code } }`.
    const httpCode = (err as { error?: { http_code?: number } } | undefined)?.error?.http_code;
    logThirdPartyApiCall({
      service: 'cloudinary',
      endpoint: 'upload_preset:get',
      method: 'GET',
      statusCode: httpCode,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: httpCode === 404 ? 'Preset not found' : 'Admin API error',
    });
    if (httpCode !== 404) {
      // Some other (likely transient) Admin API problem — don't block the
      // signature on it; the actual upload attempt will surface the real
      // error if the preset genuinely doesn't work.
      logger.warn({ err, preset: name }, 'Could not verify Cloudinary upload preset — proceeding anyway');
      return;
    }
    const createStartedAt = Date.now();
    try {
      await cloudinary.api.create_upload_preset({ name, unsigned: false });
      logThirdPartyApiCall({
        service: 'cloudinary',
        endpoint: 'upload_preset:create',
        method: 'POST',
        durationMs: Date.now() - createStartedAt,
        success: true,
      });
      confirmedPresets.add(name);
      logger.info({ preset: name }, 'Auto-provisioned missing Cloudinary upload preset');
    } catch (createErr) {
      logThirdPartyApiCall({
        service: 'cloudinary',
        endpoint: 'upload_preset:create',
        method: 'POST',
        durationMs: Date.now() - createStartedAt,
        success: false,
        errorMessage: 'Failed to create upload preset',
      });
      logger.error(
        { err: createErr, preset: name },
        'Failed to auto-provision missing Cloudinary upload preset — uploads using it will fail',
      );
    }
  }
}

/**
 * Generates a signed-upload payload so the browser can upload directly to Cloudinary
 * without the file bytes ever passing through the API — keeps API servers stateless
 * and avoids proxying large payloads through the request/response cycle.
 */
export async function createUploadSignature({ preset, folder }: SignatureRequest): Promise<SignaturePayload> {
  const cloudinary = await getCloudinaryClient();
  await ensureUploadPreset(cloudinary, preset);
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder,
    upload_preset: preset,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    cloudinary.config().api_secret as string,
  );

  return {
    timestamp,
    signature,
    apiKey: cloudinary.config().api_key as string,
    cloudName: cloudinary.config().cloud_name as string,
    folder,
    uploadPreset: preset,
  };
}

/** Generates a short-lived signed delivery URL for private assets (e.g. prescriptions). */
export async function getSignedDeliveryUrl(publicId: string, expiresInSeconds = 300): Promise<string> {
  const cloudinary = await getCloudinaryClient();
  return cloudinary.utils.private_download_url(publicId, 'jpg', {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
  });
}

export async function destroyAsset(publicId: string): Promise<void> {
  const cloudinary = await getCloudinaryClient();
  const startedAt = Date.now();
  try {
    await cloudinary.uploader.destroy(publicId);
    logThirdPartyApiCall({
      service: 'cloudinary',
      endpoint: 'destroy',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: true,
    });
  } catch (err) {
    logThirdPartyApiCall({
      service: 'cloudinary',
      endpoint: 'destroy',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: 'Asset destroy failed',
    });
    throw err;
  }
}

interface UploadBufferOptions {
  folder: string;
  publicId?: string;
  resourceType?: 'image' | 'raw' | 'video';
}

/** Server-side upload for generated files (invoice PDFs) — the one exception to the direct-to-Cloudinary rule, since the API generates these bytes itself. */
export async function uploadBuffer(
  buffer: Buffer,
  options: UploadBufferOptions,
): Promise<{ publicId: string; url: string }> {
  const cloudinary = await getCloudinaryClient();
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: options.resourceType ?? 'raw',
      },
      (error, result) => {
        const success = !error && !!result;
        logThirdPartyApiCall({
          service: 'cloudinary',
          endpoint: 'upload_stream',
          method: 'POST',
          durationMs: Date.now() - startedAt,
          success,
          errorMessage: success ? undefined : 'Buffer upload failed',
        });
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );
    stream.end(buffer);
  });
}
