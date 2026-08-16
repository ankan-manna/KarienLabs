import Redis from 'ioredis';

import { env } from './env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

/** Separate connection for BullMQ (it manages blocking commands and wants its own client). */
export function createQueueConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
