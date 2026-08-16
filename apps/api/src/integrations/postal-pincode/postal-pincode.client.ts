import { logger } from '../../config/logger';
import { logThirdPartyApiCall } from '../logging/third-party-metrics.logger';

/**
 * Prompt 31 Part 3 — thin client for India Post's public pincode-lookup API
 * (`https://api.postalpincode.in/pincode/{code}`). No API key/auth exists
 * for this service. Deliberately narrow surface (one function, one shape)
 * mirroring the existing shiprocket.client.ts's separation of "talk to the
 * third party" from "decide what that means for an address" (the latter
 * lives in address-verification.service.ts).
 */

const BASE_URL = 'https://api.postalpincode.in/pincode';
const REQUEST_TIMEOUT_MS = 8_000;
// Part 47 — pincode lookups are a safe, idempotent GET; one retry absorbs a
// transient network blip without the caller needing its own retry logic.
const MAX_ATTEMPTS = 2;

interface PostOfficeEntry {
  Name?: string;
  District?: string;
  State?: string;
  Country?: string;
}

interface PostalPincodeApiResponseEntry {
  Message?: string;
  Status?: string;
  PostOffice?: PostOfficeEntry[] | null;
}

export type PincodeLookupResult =
  | { outcome: 'valid'; district: string; state: string; postOffices: string[] }
  | { outcome: 'invalid' }
  // Distinct from `invalid` — the API was reachable and answered, but with a
  // shape/status this client doesn't recognize as a definitive yes/no. Never
  // treated as "invalid" by callers (that would incorrectly reject a real
  // pincode over an API quirk); always treated as "could not verify."
  | { outcome: 'unknown' }
  // The API was unreachable/timed out/errored after retrying — callers must
  // decide their own fail-open-vs-closed posture (Part 34); this client
  // itself makes no such judgment call.
  | { outcome: 'unreachable' };

async function fetchOnce(pincode: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}/${encodeURIComponent(pincode)}`, {
      method: 'GET',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validates a pincode against India Post's own directory and, when valid,
 * returns the district/state/post-office names it resolves to (for the
 * city/state cross-check in address-verification.service.ts). Never throws
 * for a merely-invalid or unreachable pincode — those are ordinary, expected
 * outcomes a caller branches on, not exceptional cases.
 */
export async function lookupPincode(pincode: string): Promise<PincodeLookupResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      const res = await fetchOnce(pincode);
      logThirdPartyApiCall({
        service: 'postal_pincode',
        endpoint: '/pincode/:code',
        method: 'GET',
        statusCode: res.status,
        durationMs: Date.now() - startedAt,
        success: res.ok,
        retryCount: attempt - 1,
      });

      if (!res.ok) {
        // Retry on server-side failure; a 4xx from this API (malformed
        // pincode shape) is not retryable and falls through to `unknown`.
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) continue;
        return { outcome: 'unknown' };
      }

      const body = (await res.json()) as unknown;
      // Never blindly trust a 200 — validate the actual shape before acting
      // on it (Part 3's explicit requirement).
      if (!Array.isArray(body) || body.length === 0) return { outcome: 'unknown' };
      const entry = body[0] as PostalPincodeApiResponseEntry;

      if (entry.Status === 'Success' && Array.isArray(entry.PostOffice) && entry.PostOffice.length > 0) {
        const first = entry.PostOffice[0];
        if (!first.District || !first.State) return { outcome: 'unknown' };
        return {
          outcome: 'valid',
          district: first.District,
          state: first.State,
          postOffices: entry.PostOffice.map((po) => po.Name).filter((n): n is string => Boolean(n)),
        };
      }

      // The API's own definitive "no such pincode" answer.
      if (entry.Status === 'Error' || entry.Message?.toLowerCase().includes('no records found')) {
        return { outcome: 'invalid' };
      }

      return { outcome: 'unknown' };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  logger.warn({ err: lastError, pincode }, 'Postal pincode API unreachable after retry');
  logThirdPartyApiCall({
    service: 'postal_pincode',
    endpoint: '/pincode/:code',
    method: 'GET',
    statusCode: 0,
    durationMs: 0,
    success: false,
    retryCount: MAX_ATTEMPTS - 1,
  });
  return { outcome: 'unreachable' };
}
