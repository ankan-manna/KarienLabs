import type { NextFunction, Request, Response } from 'express';

import { redis } from '../config/redis';
import { BlockedIpModel } from '../modules/security/models/blocked-ip.model';

const CACHE_KEY_PREFIX = 'security:blocked-ip:';
const CACHE_TTL_SECONDS = 30;

/**
 * Mirrors maintenance-mode.middleware.ts's Redis-cached-with-short-TTL
 * pattern: a blocked/not-blocked bit per IP, cached for a short window so the
 * hot path (every request) doesn't hit Mongo, but a fresh block/unblock from
 * the Security Center takes effect within `CACHE_TTL_SECONDS` without an
 * explicit invalidation call being required (invalidateBlockedIpCache below
 * still clears it eagerly on write for the common case).
 */
async function isIpBlocked(ip: string): Promise<boolean> {
  const cacheKey = `${CACHE_KEY_PREFIX}${ip}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const blocked = await BlockedIpModel.exists({ ipAddress: ip });
  await redis.set(cacheKey, blocked ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
  return Boolean(blocked);
}

export async function invalidateBlockedIpCache(ip?: string): Promise<void> {
  if (ip) {
    await redis.del(`${CACHE_KEY_PREFIX}${ip}`);
    return;
  }
  // No specific IP (e.g. bulk change) — cheap enough to just let the TTL expire
  // naturally on the affected key; nothing further to do here.
}

/** Gates every `/api/v1/*` request against the BlockedIp collection — 403s IPs an admin has explicitly blocked from the Security Center. */
export async function blockedIpGate(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  if (!ip) return next();

  const blocked = await isIpBlocked(ip);
  if (!blocked) return next();

  return res.status(403).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: 'IP_BLOCKED',
      message: 'Access from this IP address has been blocked by the platform administrator.',
    },
  });
}
