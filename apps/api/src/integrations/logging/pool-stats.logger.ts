import { monitorEventLoopDelay } from 'node:perf_hooks';

import mongoose from 'mongoose';
import pino from 'pino';

import { env, isTest } from '../../config/env';
import { RotatingLogDestination } from '../../config/log-rotation';
import { LOG_DIR } from '../../config/logger';
import { redis } from '../../config/redis';

/**
 * Prompt 18 Part 20 — the Node/MERN equivalent of the reference
 * `PoolStatsLogger`. This codebase doesn't expose a raw JDBC-style
 * connection-pool (available/in-use/waiting counts) the way the Java
 * reference architecture did, so rather than inventing numbers that don't
 * exist, this samples the REAL equivalent signals this stack actually has:
 * the Mongoose/MongoDB connection readyState, the ioredis client status,
 * Node's event-loop delay (the most direct signal of whether ANY I/O —
 * including logging itself, per Part 6/51 — is blocking the process), and
 * process memory. Same dedicated-category/own-rotating-file/own-S3-prefix
 * treatment as the third-party-api logger.
 */

const SERVICE_NAME = (process.argv[1] ?? '').includes('worker') ? 'worker' : 'api';

let destination: RotatingLogDestination | null = null;
if (!isTest) {
  destination = new RotatingLogDestination({
    logDir: LOG_DIR,
    category: `${SERVICE_NAME}-pool-stats`,
    timezone: env.LOG_TIMEZONE,
    rotationHours: env.LOG_ROTATION_HOURS,
  });
}

const poolStatsLogger = pino(
  { level: env.LOG_LEVEL, base: { service: SERVICE_NAME, logCategory: 'pool-stats' } },
  destination ?? undefined,
);

const MONGO_READY_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

const eventLoopHistogram = isTest ? null : monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram?.enable();

function sampleOnce(): void {
  const mem = process.memoryUsage();
  const readyState = mongoose.connection.readyState;

  poolStatsLogger.info({
    event: 'POOL_STATS_SAMPLE',
    mongo: {
      readyState,
      readyStateLabel: MONGO_READY_STATE_LABELS[readyState] ?? 'unknown',
      connectionCount: mongoose.connections.length,
    },
    redis: { status: redis.status },
    eventLoop: eventLoopHistogram
      ? {
          meanMs: Math.round((eventLoopHistogram.mean / 1e6) * 100) / 100,
          maxMs: Math.round((eventLoopHistogram.max / 1e6) * 100) / 100,
        }
      : null,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
    uptimeSeconds: Math.round(process.uptime()),
  });

  eventLoopHistogram?.reset();
}

let intervalHandle: NodeJS.Timeout | null = null;

/** Called once at process boot (server.ts / worker.ts) — idempotent, safe to call twice (clears any prior interval first). */
export function startPoolStatsSampler(): void {
  if (isTest) return;
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(sampleOnce, env.LOG_POOL_STATS_INTERVAL_MINUTES * 60_000);
  intervalHandle.unref();
}

export function stopPoolStatsSampler(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

export function flushPoolStatsLogSync(): void {
  destination?.flushSync();
}
