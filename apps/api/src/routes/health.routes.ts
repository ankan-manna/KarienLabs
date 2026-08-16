import { Router } from 'express';
import mongoose from 'mongoose';

import { redis } from '../config/redis';

export const healthRouter = Router();

/**
 * Prompt 24 Part 49/50 — liveness: "is the Node.js process alive and able
 * to handle an HTTP request?" Deliberately checks NOTHING external
 * (Mongo/Redis) — Docker's `HEALTHCHECK` (Dockerfile) and any orchestrator
 * restart policy hit this path, and Part 50 is explicit that a liveness
 * probe "must not depend on every external service being healthy" (a
 * temporary MongoDB blip should not cause a perfectly healthy API process
 * to be killed and restarted — that would make an already-bad outage
 * worse via a restart storm). `/health` is kept as the original path
 * (nothing that already depends on it — Docker/nginx — needs to change);
 * `/health/live` is an explicit alias for orchestrators that expect that
 * exact convention.
 */
function livenessHandler(_req: import('express').Request, res: import('express').Response) {
  res.status(200).json({ status: 'ok' });
}

healthRouter.get('/health', livenessHandler);
healthRouter.get('/health/live', livenessHandler);

const READINESS_CHECK_TIMEOUT_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/**
 * Part 49/51/52 — readiness: "can this instance actually serve traffic
 * right now?" Checks the two dependencies EVERY request in this app
 * ultimately needs (MongoDB for all business data, Redis for rate
 * limiting/config-cache/queues) — deliberately NOT calling out to
 * Razorpay/Cloudinary/S3/Shiprocket/SMTP here (Part 52: "do not call
 * expensive third-party APIs on every health request" — those are checked
 * lazily, on-demand, by the existing `/admin/platform-health` panel
 * instead, which is explicitly not meant to be hit on every load-balancer
 * probe interval). A short per-dependency timeout keeps this endpoint
 * itself cheap even when a dependency is hanging rather than cleanly
 * erroring.
 */
healthRouter.get('/health/ready', async (_req, res) => {
  const checks: Record<string, boolean> = {};

  checks.mongo = mongoose.connection.readyState === 1;

  try {
    const pong = await withTimeout(redis.ping(), READINESS_CHECK_TIMEOUT_MS);
    checks.redis = pong === 'PONG';
  } catch {
    checks.redis = false;
  }

  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});
