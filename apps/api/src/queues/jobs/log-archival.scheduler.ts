import { env, isTest } from '../../config/env';
import { logger } from '../../config/logger';

import { runLogArchivalJob } from './log-archival.job';

/**
 * Part 17/38/48 — log archival deliberately runs as an IN-PROCESS
 * timer in EVERY process that produces local rotated logs (both `api` and
 * `worker` — see server.ts/worker.ts), rather than as a single centralized
 * BullMQ job (which is how  15's original log-upload job worked).
 *
 * Why the change: this codebase's Docker deployment (infra/docker/
 * docker-compose*.yml) runs `api` and `worker` as SEPARATE containers with
 * SEPARATE filesystems, and `api` runs with `deploy.replicas: 2` in
 * production. A single BullMQ job running only in the `worker` container
 * can only ever see the WORKER's own local log directory — it structurally
 * cannot reach into a different container's ephemeral filesystem to
 * archive the API's logs. Rather than introducing a shared Docker volume
 * (which would then need per-replica subdirectories to avoid two `api`
 * replicas writing into the same local file — real added complexity), each
 * process independently archives its OWN local logs to S3 using its own
 * `os.hostname()`-scoped object key (see storage.util.ts's
 * buildLogObjectKey) — no shared state, no cross-container dependency,
 * safe under any replica count. The S3-side retention SWEEP
 * (log-retention-sweep.job.ts) legitimately stays a single centralized
 * BullMQ job, since it only touches S3, never local disk.
 */
export function startLogArchivalScheduler(): () => void {
  if (isTest) return () => {};

  const intervalMs = env.LOG_ARCHIVAL_WORKER_INTERVAL_MINUTES * 60_000;

  // Part 38 — run once immediately at boot too, so a process that just
  // restarted recovers any archives left pending from before the crash
  // without waiting for the first scheduled tick.
  void runLogArchivalJob().catch((error) => logger.error({ err: error }, 'Initial log archival run failed'));

  const handle = setInterval(() => {
    void runLogArchivalJob().catch((error) => logger.error({ err: error }, 'Scheduled log archival run failed'));
  }, intervalMs);
  handle.unref();

  return () => clearInterval(handle);
}
