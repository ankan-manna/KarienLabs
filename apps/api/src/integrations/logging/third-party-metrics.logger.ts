import pino from 'pino';

import { env, isTest } from '../../config/env';
import { RotatingLogDestination } from '../../config/log-rotation';
import { LOG_DIR } from '../../config/logger';
import { getRequestContext } from '../../config/request-context';

/**
 * Prompt 18 Part 18/19 — the Node/MERN equivalent of the reference
 * `ThirdPartyApiMetricsAppender` / `third-party-api-metrics-logger`: a
 * DEDICATED logger category, kept architecturally separate from the main
 * application log (its own rotating file, its own S3 sub-prefix — see
 * storage.util.ts's buildLogObjectKey), so a spike in Razorpay/Shiprocket/
 * S3 call volume never drowns out ordinary application logs, and an
 * operator can pull `logs/third-party-api/...` in isolation.
 *
 * Captures ONLY safe operational metadata (Part 18) — never request/response
 * bodies, never credentials/signed URLs (those are exactly what the shared
 * REDACT_PATHS + sanitizeForLogging already guard against elsewhere, but
 * this logger's call sites are expected to only ever pass the fields on
 * `ThirdPartyApiCallMeta` below, nothing raw).
 */

const SERVICE_NAME = (process.argv[1] ?? '').includes('worker') ? 'worker' : 'api';

let destination: RotatingLogDestination | null = null;
if (!isTest) {
  destination = new RotatingLogDestination({
    logDir: LOG_DIR,
    category: `${SERVICE_NAME}-third-party-api`,
    timezone: env.LOG_TIMEZONE,
    rotationHours: env.LOG_ROTATION_HOURS,
  });
}

function contextMixin(): Record<string, unknown> {
  const ctx = getRequestContext();
  if (!ctx) return {};
  const out: Record<string, unknown> = { requestId: ctx.requestId, tenant: ctx.tenant };
  if (ctx.actorId) out.actorId = ctx.actorId;
  if (ctx.actorType) out.actorType = ctx.actorType;
  if (ctx.jobId) out.jobId = ctx.jobId;
  return out;
}

const thirdPartyLogger = pino(
  {
    level: env.LOG_LEVEL,
    base: { service: SERVICE_NAME, logCategory: 'third-party-api' },
    mixin: contextMixin,
  },
  destination ?? undefined,
);

export interface ThirdPartyApiCallMeta {
  /** e.g. 'razorpay' | 'shiprocket' | 's3' | 'google-oauth' | 'cloudinary'. */
  service: string;
  /** A category/label for the operation, not a raw URL with query params (Part 18). */
  endpoint: string;
  method: string;
  statusCode?: number;
  durationMs: number;
  success: boolean;
  retryCount?: number;
  errorMessage?: string;
}

/** The single call sites across the codebase should use instead of ad-hoc `logger.info()` calls for outbound third-party HTTP calls. */
export function logThirdPartyApiCall(meta: ThirdPartyApiCallMeta): void {
  const level = meta.success ? 'info' : 'warn';
  thirdPartyLogger[level](
    {
      event: meta.success ? 'THIRD_PARTY_API_CALL_SUCCESS' : 'THIRD_PARTY_API_CALL_FAILED',
      service: meta.service,
      endpoint: meta.endpoint,
      method: meta.method,
      statusCode: meta.statusCode,
      durationMs: meta.durationMs,
      retryCount: meta.retryCount ?? 0,
      errorMessage: meta.errorMessage,
    },
    `Third-party API call: ${meta.service} ${meta.endpoint}`,
  );
}

export function flushThirdPartyMetricsLogSync(): void {
  destination?.flushSync();
}
