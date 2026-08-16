import { ROLES } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { redis } from '../config/redis';
import { verifyAccessToken } from '../modules/auth/jwt.util';
import { ConfigurationModel } from '../modules/platform/models/configuration.model';


const CACHE_KEY = 'config:global:maintenanceMode';
const CACHE_TTL_SECONDS = 30;

interface GlobalConfigValue {
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}

async function readMaintenanceConfig(): Promise<GlobalConfigValue> {
  const cached = await redis.get(CACHE_KEY);
  if (cached !== null) return JSON.parse(cached) as GlobalConfigValue;

  const config = await ConfigurationModel.findOne({ namespace: 'global' }).lean();
  const value: GlobalConfigValue = (config?.value as GlobalConfigValue) ?? {};
  await redis.set(CACHE_KEY, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  return value;
}

export async function invalidateMaintenanceModeCache(): Promise<void> {
  await redis.del(CACHE_KEY);
}

const ALWAYS_ALLOWED_PREFIXES = ['/api/v1/auth', '/api/v1/configuration'];

/**
 * System Configuration spec item: "Maintenance Mode" — a toggle that actually
 * blocks the platform, not just a flag nobody reads. Admin/super_admin roles
 * (and auth/configuration routes, so an admin can still log in and turn it
 * back off) always pass through; everyone else gets 503 while it's enabled.
 * Mirrors the Redis-cached-with-short-TTL pattern already used by
 * feature-flag.middleware.ts, invalidated explicitly on config write (see
 * configuration.service.ts) rather than relying on TTL expiry alone.
 */
export async function maintenanceModeGate(req: Request, res: Response, next: NextFunction) {
  const { maintenanceMode, maintenanceMessage } = await readMaintenanceConfig();
  if (!maintenanceMode) return next();

  if (ALWAYS_ALLOWED_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length));
      if (payload.role === ROLES.ADMIN || payload.role === ROLES.SUPER_ADMIN) return next();
    } catch {
      // Falls through to the 503 below — an invalid token doesn't get maintenance-mode bypass.
    }
  }

  return res.status(503).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: 'MAINTENANCE_MODE',
      message: maintenanceMessage || 'The platform is currently undergoing maintenance. Please try again shortly.',
    },
  });
}
