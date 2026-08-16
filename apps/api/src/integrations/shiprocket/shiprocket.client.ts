import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getConfiguration } from '../../modules/platform/configuration.service';
import { logThirdPartyApiCall } from '../logging/third-party-metrics.logger';

/**
 * Thin, backend-only Shiprocket REST client (Part 13). Mirrors the existing
 * razorpay.client.ts pattern: credentials resolved from the `shiprocket`
 * Configuration namespace first (DB-configured, settable by Super Admin —
 * Part 28), falling back to env vars, cached in-memory. Never exposes
 * credentials to any caller outside this file — every other module only ever
 * sees the resolved data returned by the functions below, never the
 * email/password/token themselves (Part 13/30).
 */

interface ShiprocketCredentials {
  email: string;
  password: string;
  baseUrl: string;
  pickupLocation: string;
  webhookToken: string;
}

const CREDENTIALS_CACHE_TTL_MS = 60_000;
let credentialsCache: { value: ShiprocketCredentials; expiresAt: number } | null = null;

function envCredentials(): ShiprocketCredentials {
  return {
    email: env.SHIPROCKET_EMAIL,
    password: env.SHIPROCKET_PASSWORD,
    baseUrl: env.SHIPROCKET_BASE_URL,
    pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
    webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
  };
}

async function resolveCredentials(): Promise<ShiprocketCredentials> {
  const now = Date.now();
  if (credentialsCache && credentialsCache.expiresAt > now) return credentialsCache.value;

  let value = envCredentials();
  try {
    const dbConfig = (await getConfiguration('shiprocket')) as Partial<ShiprocketCredentials>;
    value = {
      email: dbConfig.email || value.email,
      password: dbConfig.password || value.password,
      baseUrl: dbConfig.baseUrl || value.baseUrl,
      pickupLocation: dbConfig.pickupLocation || value.pickupLocation,
      webhookToken: dbConfig.webhookToken || value.webhookToken,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read shiprocket configuration from DB — falling back to env vars');
  }

  credentialsCache = { value, expiresAt: now + CREDENTIALS_CACHE_TTL_MS };
  return value;
}

export async function isShiprocketConfigured(): Promise<boolean> {
  const { email, password } = await resolveCredentials();
  return Boolean(email && password);
}

export async function getShiprocketWebhookToken(): Promise<string> {
  return (await resolveCredentials()).webhookToken;
}

export async function getShiprocketPickupLocationName(): Promise<string> {
  return (await resolveCredentials()).pickupLocation;
}

// Shiprocket auth tokens are valid for ~10 days; refresh well before that and
// on any 401 to stay resilient to early revocation/rotation.
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000;
let tokenCache: { token: string; expiresAt: number; forFingerprint: string } | null = null;

async function authenticate(): Promise<string> {
  const { email, password, baseUrl } = await resolveCredentials();
  if (!email || !password) {
    throw new Error('Shiprocket is not configured — set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD');
  }

  const fingerprint = `${email}:${password}:${baseUrl}`;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now && tokenCache.forFingerprint === fingerprint) {
    return tokenCache.token;
  }

  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // Deliberately not logging the response body — it can echo back the
    // submitted email in error messages, and this is a credentials endpoint.
    logger.error({ status: res.status }, 'Shiprocket authentication failed');
    throw new Error('Shiprocket authentication failed');
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('Shiprocket authentication response missing token');

  tokenCache = { token: data.token, expiresAt: now + TOKEN_TTL_MS, forFingerprint: fingerprint };
  return data.token;
}

/**
 * Bugfix (Order/Shiprocket/Invoice/Logging) Part 8 — the previous log call
 * dumped up to 2000 raw chars of Shiprocket's response body. Shiprocket
 * error messages can echo back submitted request data (Shiprocket's own
 * "Please add billing/shipping address first" style messages sometimes
 * include the offending field's value), and `REDACT_PATHS` in logger.ts
 * matches structured field NAMES — it can't reach into a raw text blob. This
 * parses the JSON error body and keeps only the fields that are actually
 * useful for debugging (`message`, `status_code`, `errors`) — the same shape
 * the prompt's own worked example expects — discarding anything else
 * Shiprocket might have echoed back. Falls back to a short, hard-capped
 * excerpt only when the body isn't valid JSON (rare — Shiprocket's API is
 * JSON-only, but a proxy/gateway error page could return HTML).
 */
function sanitizeShiprocketErrorBody(bodyText: string): unknown {
  if (!bodyText) return undefined;
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const { message, status_code, errors } = parsed;
    return { message, status_code, errors };
  } catch {
    return { raw: bodyText.slice(0, 300) };
  }
}

export interface ShiprocketRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Set true for the rare call that must not trigger an auth retry loop (avoids infinite recursion on a broken auth endpoint). */
  skipRetryOnAuthFailure?: boolean;
}

/**
 * Low-level authenticated request helper. Retries exactly once on a 401 (token
 * may have been revoked/rotated externally) by forcing a fresh login. Never
 * includes credentials in thrown errors or logs — only status codes and a
 * short, generic message make it out of this function.
 */
export async function shiprocketRequest<T>(
  path: string,
  options: ShiprocketRequestOptions = {},
): Promise<T> {
  const { baseUrl } = await resolveCredentials();
  const token = await authenticate();
  const method = options.method ?? 'GET';
  const startedAt = Date.now();
  let retryCount = 0;

  const doFetch = async (bearer: string) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(token);

  if (res.status === 401 && !options.skipRetryOnAuthFailure) {
    tokenCache = null;
    retryCount += 1;
    const freshToken = await authenticate();
    res = await doFetch(freshToken);
  }

  // Prompt 18 Part 18 — dedicated third-party-api-metrics logger, kept
  // architecturally separate from the main application log. Only safe
  // operational metadata (Part 18/22) — never the request/response body,
  // never the bearer token.
  logThirdPartyApiCall({
    service: 'shiprocket',
    endpoint: path,
    method,
    statusCode: res.status,
    durationMs: Date.now() - startedAt,
    success: res.ok,
    retryCount,
  });

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    logger.error(
      { method, path, status: res.status, retryCount, responseBody: sanitizeShiprocketErrorBody(bodyText) },
      'Shiprocket API request failed',
    );
    throw new Error(`Shiprocket API request failed (${res.status})`);
  }

  return (await res.json()) as T;
}
