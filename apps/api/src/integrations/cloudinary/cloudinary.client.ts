import { v2 as cloudinary } from 'cloudinary';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

interface CloudinaryCredentialsCache {
  value: CloudinaryCredentials;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: CloudinaryCredentialsCache | null = null;
/** Fingerprint of the credentials currently applied via `cloudinary.config(...)`, so we only re-config when they actually change. */
let configuredFor: string | null = null;

function envCredentials(): CloudinaryCredentials {
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

/**
 * Resolves Cloudinary credentials, preferring the `cloudinary` Configuration
 * namespace (fields `cloudName`/`apiKey`/`apiSecret`) over env vars when populated,
 * falling back to env vars otherwise — the default/current behavior when no DB
 * config exists. Cached in-memory for `CACHE_TTL_MS` so hot upload/signature paths
 * don't hit Mongo on every call. Defensively falls back to env-only on any DB read
 * error, so a transient Mongo hiccup never breaks uploads that used to work purely
 * from env vars.
 */
async function resolveCredentials(): Promise<CloudinaryCredentials> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let value = envCredentials();
  try {
    const dbConfig = (await getConfiguration('cloudinary')) as Partial<CloudinaryCredentials>;
    value = {
      cloudName: dbConfig.cloudName || value.cloudName,
      apiKey: dbConfig.apiKey || value.apiKey,
      apiSecret: dbConfig.apiSecret || value.apiSecret,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read cloudinary configuration from DB — falling back to env vars');
  }

  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * Lazily (re)configures and returns the Cloudinary SDK singleton. Deferring
 * configuration to first use (and re-resolving every `CACHE_TTL_MS`) means an
 * admin can update Cloudinary credentials via the Configuration UI without a
 * redeploy, while unmodified stores keep behaving exactly as before (env vars only).
 */
export async function getCloudinaryClient(): Promise<typeof cloudinary> {
  const { cloudName, apiKey, apiSecret } = await resolveCredentials();
  const fingerprint = `${cloudName}:${apiKey}:${apiSecret}`;
  if (configuredFor !== fingerprint) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    configuredFor = fingerprint;
  }
  return cloudinary;
}

export { cloudinary };
