import type { Server } from 'http';

import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { flushLogsSync, logger } from './config/logger';
import { redis } from './config/redis';
import { flushPoolStatsLogSync, startPoolStatsSampler } from './integrations/logging/pool-stats.logger';
import { flushThirdPartyMetricsLogSync } from './integrations/logging/third-party-metrics.logger';
import './models.registry';
import { startLogArchivalScheduler } from './queues/jobs/log-archival.scheduler';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // Part 17/20/38 — each process (api + worker) independently
  // rotates/archives its OWN local logs and samples its OWN pool/system
  // stats; see log-archival.scheduler.ts for why this is per-process
  // rather than a single centralized BullMQ job.
  const stopLogArchival = startLogArchivalScheduler();
  startPoolStatsSampler();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    stopLogArchival();
    server.close(async () => {
      await disconnectDatabase();
      await redis.quit();
      logger.info('Shutdown complete');
      // Part 39 — flush every rotating destination synchronously as the
      // very last step, after every other subsystem is already quiescent.
      flushLogsSync();
      flushThirdPartyMetricsLogSync();
      flushPoolStatsLogSync();
      process.exit(0);
    });

    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — exiting');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
