import fs from 'node:fs';
import path from 'node:path';

import pino from 'pino';
import prettyFactory from 'pino-pretty';

import { env, isProduction, isTest } from './env';
import { RotatingLogDestination } from './log-rotation';
import { getRequestContext } from './request-context';

// Part 13/21 originally, extended by Part 1/28/29 —
// local NDJSON application log files, now rotated at 6-hour WALL-CLOCK
// boundaries (see log-rotation.ts) rather than once per calendar day.
// 'api' vs 'worker' (by entry script) keeps the two processes' logs in
// separate files/S3 objects without adding a new env var, same as before.
const SERVICE_NAME = (process.argv[1] ?? '').includes('worker') ? 'worker' : 'api';
export const LOG_DIR = env.LOG_DIRECTORY || path.resolve(process.cwd(), 'logs');
/** The log category this file's rotating destination writes under (Part 2/10) — distinct from third-party-api/pool-stats, which get their OWN RotatingLogDestination (see integrations/logging/). */
export const APPLICATION_LOG_CATEGORY = `${SERVICE_NAME}-application`;

if (!isTest) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // Non-fatal — logging still works via stdout even if the local file
    // destination can't be created (e.g. read-only filesystem).
  }
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.razorpay_signature',
  '*.cardNumber',
  // OTP codes, OTP challenge/reset-session tokens, and
  // anything Google-OAuth-shaped must never reach log output either.
  '*.code',
  '*.otp',
  '*.devOnlyCode',
  '*.challengeToken',
  '*.resetSessionToken',
  '*.idToken',
  '*.id_token',
  '*.googleAccessToken',
  '*.googleIdToken',
  '*.access_token',
  '*.refresh_token',
  // Part 12 — Shiprocket/AWS/Razorpay secrets must never reach a
  // log file that later gets uploaded to S3, same as any other secret above.
  '*.awsSecretAccessKey',
  '*.secretAccessKey',
  '*.accessKeyId',
  '*.shiprocketPassword',
  '*.webhookSecret',
  '*.keySecret',
  // Part 22/23 — cards/bank details, presigned URLs (a signed S3
  // URL IS a bearer credential for the duration of its validity), and any
  // field literally carrying document/prescription bytes.
  '*.cvv',
  '*.bankAccountNumber',
  '*.accountNumber',
  '*.signedUrl',
  '*.presignedUrl',
  '*.uploadUrl',
  '*.downloadUrl',
  '*.apiKey',
  '*.clientSecret',
  '*.privateKey',
  '*.documentContent',
  '*.fileBuffer',
];

/** Merges the active request/job context (config/request-context.ts) into EVERY log line from every module — this is what makes `requestId`/`tenant`/`actorId` appear without threading them through call signatures (Part 4/5/30/31/32). Cheap: a single AsyncLocalStorage read per log call, no I/O. */
function contextMixin(): Record<string, unknown> {
  const ctx = getRequestContext();
  if (!ctx) return {};
  const out: Record<string, unknown> = { requestId: ctx.requestId, tenant: ctx.tenant };
  if (ctx.actorId) out.actorId = ctx.actorId;
  if (ctx.actorType) out.actorType = ctx.actorType;
  if (ctx.role) out.role = ctx.role;
  if (ctx.jobId) out.jobId = ctx.jobId;
  if (ctx.jobName) out.jobName = ctx.jobName;
  return out;
}

let applicationDestination: RotatingLogDestination | null = null;

function buildDestination(): pino.DestinationStream | undefined {
  if (isTest) return undefined; // No file I/O in unit tests — matches the pre--18 behavior exactly.

  applicationDestination = new RotatingLogDestination({
    logDir: LOG_DIR,
    category: APPLICATION_LOG_CATEGORY,
    timezone: env.LOG_TIMEZONE,
    rotationHours: env.LOG_ROTATION_HOURS,
  });

  const consoleStream = isProduction
    ? process.stdout
    : prettyFactory({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' });

  return pino.multistream([
    { stream: applicationDestination, level: env.LOG_LEVEL },
    { stream: consoleStream, level: env.LOG_LEVEL },
  ]);
}

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { service: SERVICE_NAME },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    mixin: contextMixin,
  },
  buildDestination(),
);

/** Part 39 — graceful shutdown: flush buffered log bytes synchronously before the process exits, so nothing written right before shutdown is lost. Safe no-op in test mode (no destination was ever created). */
export function flushLogsSync(): void {
  applicationDestination?.flushSync();
}
