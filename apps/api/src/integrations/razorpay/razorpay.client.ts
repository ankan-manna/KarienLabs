import Razorpay from 'razorpay';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';

interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

interface RazorpayCredentialsCache {
  value: RazorpayCredentials;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: RazorpayCredentialsCache | null = null;

let client: Razorpay | null = null;
/** Fingerprint of the credentials the cached `client` was built with, so we only rebuild it when they actually change. */
let clientBuiltFor: string | null = null;

function envCredentials(): RazorpayCredentials {
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

/**
 * Resolves Razorpay credentials, preferring the `razorpay` Configuration namespace
 * (fields `keyId`/`keySecret`/`webhookSecret`) over env vars when populated, falling
 * back to env vars otherwise — the default/current behavior when no DB config exists.
 * Cached in-memory for `CACHE_TTL_MS` so hot payment paths don't hit Mongo on every
 * call. Defensively falls back to env-only on any DB read error, so a transient Mongo
 * hiccup never breaks payments that used to work purely from env vars.
 */
async function resolveCredentials(): Promise<RazorpayCredentials> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let value = envCredentials();
  try {
    const dbConfig = (await getConfiguration('razorpay')) as Partial<RazorpayCredentials>;
    value = {
      keyId: dbConfig.keyId || value.keyId,
      keySecret: dbConfig.keySecret || value.keySecret,
      webhookSecret: dbConfig.webhookSecret || value.webhookSecret,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read razorpay configuration from DB — falling back to env vars');
  }

  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Resolves the credentials needed for signature verification (`razorpay.service.ts`), without requiring a full client instance. */
export async function getRazorpayCredentials(): Promise<RazorpayCredentials> {
  return resolveCredentials();
}

/**
 * Lazily constructed — the Razorpay SDK throws synchronously if `key_id` is empty,
 * which would crash the whole process on boot in any environment where payment
 * keys aren't configured yet (local dev, a fresh staging box before  8's
 * configuration UI is wired up). Deferring construction to first use means the
 * rest of the API stays up; only payment routes fail until keys are set. Also
 * rebuilds the client whenever the resolved credentials change (e.g. an admin
 * saves new DB-configured keys), same re-config-on-change check as `cloudinary.client.ts`.
 */
export async function getRazorpayClient(): Promise<Razorpay> {
  const { keyId, keySecret } = await resolveCredentials();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }
  const fingerprint = `${keyId}:${keySecret}`;
  if (!client || clientBuiltFor !== fingerprint) {
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    clientBuiltFor = fingerprint;
  }
  return client;
}
