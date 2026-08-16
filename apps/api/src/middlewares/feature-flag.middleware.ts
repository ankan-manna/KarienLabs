import type { NextFunction, Request, Response } from 'express';

import { redis } from '../config/redis';
import { FeatureFlagModel } from '../modules/auth/models/feature-flag.model';
import { AppError } from '../utils/app-error';

const FLAG_CACHE_TTL_SECONDS = 60;

async function isFlagEnabled(key: string): Promise<boolean> {
  const cacheKey = `flags:${key}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const flag = await FeatureFlagModel.findOne({ key }).lean();
  const enabled = flag?.enabled ?? false;
  await redis.set(cacheKey, enabled ? '1' : '0', 'EX', FLAG_CACHE_TTL_SECONDS);
  return enabled;
}

export async function invalidateFeatureFlagCache(key: string): Promise<void> {
  await redis.del(`flags:${key}`);
}

/** Gates a route behind a feature flag key, e.g. `requireFeature('inventory.grn')`. */
export function requireFeature(key: string) {
  return async (_req: Request, _res: Response, next: NextFunction) => {
    const enabled = await isFlagEnabled(key);
    if (!enabled) {
      return next(new AppError(404, 'FEATURE_DISABLED', `Feature "${key}" is not enabled`));
    }
    next();
  };
}
