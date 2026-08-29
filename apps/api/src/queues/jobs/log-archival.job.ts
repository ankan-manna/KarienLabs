import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

import { ACTOR_TYPES, STORAGE_AUDIT_ACTIONS } from '@medcommerce/shared';

import { env } from '../../config/env';
import { LOG_DIR, logger } from '../../config/logger';
import { runWithJobContext } from '../../config/request-context';
import { isS3Configured, shouldUploadLogsToS3 } from '../../integrations/s3/s3.client';
import { uploadDocument } from '../../integrations/s3/storage.service';
import { buildLogObjectKey } from '../../integrations/s3/storage.util';
import { recordAudit } from '../../modules/audit/audit.service';

import {
  computeBackoffDelayMs,
  isDeadLetter,
  isEligibleForRetry,
  isPastLocalRetention,
  parseBucketFileName,
  type ArchivalStateMap,
} from './log-archival.util';

/**
 * Part 8/9/14/15/16/17/35/36/37/38/40 — the full local -> S3
 * archival pipeline for EVERY rotated log category (application,
 * third-party-api, pool-stats — all three write bucket-named `.log` files
 * via the SAME RotatingLogDestination shape, see log-rotation.ts), so this
 * one job handles all of them without per-category duplication:
 *
 *   scan LOG_DIR
 *     -> skip files still being actively written (current bucket)
 *     -> compress finalized `.log` -> `.gz` (streaming, Part 8)
 *     -> delete raw `.log` once compression succeeds
 *     -> upload `.gz` via the EXISTING StorageService (Part 9/56)
 *     -> delete local `.gz` once upload succeeds (Part 15)
 *     -> on failure at any stage: leave the file in place, schedule a
 *        bounded-backoff retry (Part 36), NEVER delete (Part 15/40)
 *
 * Runs on a schedule (queue.ts), never inline with a request (Part 6/17).
 * A process restart needs no special recovery code (Part 38) — the next
 * scheduled run just re-scans LOG_DIR and finds whatever was left, exactly
 * like  15's original log-upload.job.ts did for uncompressed files.
 */

const STATE_FILE = '.archival-state.json';

function loadState(): ArchivalStateMap {
  try {
    const raw = fs.readFileSync(path.join(LOG_DIR, STATE_FILE), 'utf8');
    return JSON.parse(raw) as ArchivalStateMap;
  } catch {
    return {};
  }
}

function saveState(state: ArchivalStateMap): void {
  try {
    fs.writeFileSync(path.join(LOG_DIR, STATE_FILE), JSON.stringify(state), 'utf8');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to persist log-archival retry state — retries still bounded per-run');
  }
}

function markFailure(state: ArchivalStateMap, file: string, now: Date): boolean {
  const prevAttempts = state[file]?.attempts ?? 0;
  const attempts = prevAttempts + 1;
  const dead = isDeadLetter(attempts, env.LOG_UPLOAD_RETRY_LIMIT);
  const delayMs = computeBackoffDelayMs(attempts);
  state[file] = {
    attempts,
    lastAttemptAt: now.toISOString(),
    nextRetryAt: new Date(now.getTime() + delayMs).toISOString(),
    dead,
  };
  return dead;
}

/**
 * Hard safety valve for a backlog that's grown past the configured limit
 * (e.g. a sustained S3 outage/misconfiguration, or archival disabled while
 * logs keep rotating) — always logs the breach, and additionally deletes
 * the OLDEST dead-lettered archives (oldest mtime first) until the backlog
 * is back under the limit or there are no more dead-lettered files left to
 * remove. Never touches a file that's still within its retry backoff
 * window or hasn't failed yet — only ones that have already exhausted
 * every retry (`state[file].dead`), which by definition have no further
 * automatic path to S3 anyway.
 */
function enforceDiskProtection(state: ArchivalStateMap, gzFiles: string[], rotatedLogFiles: string[]): number {
  const pendingCount = gzFiles.length + rotatedLogFiles.length;
  if (pendingCount <= env.LOG_MAX_PENDING_ARCHIVES) return 0;

  logger.error(
    { pendingCount, limit: env.LOG_MAX_PENDING_ARCHIVES, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_DISK_PROTECTION_TRIGGERED },
    'Log archival backlog exceeds the configured safety limit — investigate S3 connectivity/credentials',
  );

  const deadGzFiles = gzFiles
    .filter((f) => state[f]?.dead)
    .map((f) => ({ file: f, mtimeMs: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  let removed = 0;
  let excess = pendingCount - env.LOG_MAX_PENDING_ARCHIVES;
  for (const { file } of deadGzFiles) {
    if (excess <= 0) break;
    try {
      fs.unlinkSync(path.join(LOG_DIR, file));
      delete state[file];
      removed += 1;
      excess -= 1;
      logger.warn(
        { file, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_LOCAL_RETENTION_DELETED },
        'Deleted dead-lettered log archive to bring the backlog back under the disk-protection limit',
      );
    } catch (error) {
      logger.warn({ file, err: error }, 'Failed to delete dead-lettered archive during disk-protection enforcement');
    }
  }
  return removed;
}

/**
 * Local-only retention ceiling, independent of the disk-protection count
 * above: a `.gz` archive with no further path off this host — either
 * dead-lettered (exhausted every retry) or created while S3 archival is
 * disabled/unconfigured entirely — is deleted once it's older than
 * `LOG_LOCAL_MAX_RETENTION_DAYS`, so a permanently-broken or disabled S3
 * pipeline still can't accumulate local archives forever. A file still
 * actively retrying within its backoff window is never touched here
 * regardless of age.
 */
function enforceLocalRetention(state: ArchivalStateMap, archivalEnabled: boolean, now: Date): number {
  if (!fs.existsSync(LOG_DIR)) return 0;
  const gzFiles = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log.gz'));
  let deleted = 0;

  for (const gzFile of gzFiles) {
    const eligible = !archivalEnabled || state[gzFile]?.dead === true;
    if (!eligible) continue;

    const gzPath = path.join(LOG_DIR, gzFile);
    const stat = fs.statSync(gzPath);
    if (!isPastLocalRetention(stat.mtime, env.LOG_LOCAL_MAX_RETENTION_DAYS, now)) continue;

    try {
      fs.unlinkSync(gzPath);
      delete state[gzFile];
      deleted += 1;
      logger.info(
        { file: gzFile, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_LOCAL_RETENTION_DELETED },
        'Deleted local log archive past its local-only retention window',
      );
    } catch (error) {
      logger.warn({ file: gzFile, err: error }, 'Failed to delete log archive past local retention window');
    }
  }
  return deleted;
}

async function compressFile(logPath: string, gzPath: string): Promise<void> {
  await pipeline(fs.createReadStream(logPath), zlib.createGzip(), fs.createWriteStream(gzPath));
}

interface RunSummary {
  compressed: number;
  uploaded: number;
  failed: number;
  deadLettered: number;
  localRetentionDeleted: number;
}

async function runOnce(): Promise<RunSummary> {
  const summary: RunSummary = { compressed: 0, uploaded: 0, failed: 0, deadLettered: 0, localRetentionDeleted: 0 };
  if (!fs.existsSync(LOG_DIR)) return summary;

  const now = new Date();
  const state = loadState();
  const entries = fs.readdirSync(LOG_DIR);

  // The file currently being written for each category is always the LAST
  // (lexicographically greatest bucket label) `.log` per category prefix —
  // simplest safe way to identify "still active" without importing the
  // live RotatingLogDestination instances (this job runs in the worker
  // process, which has its OWN destinations; the api process's active file
  // is only ever touched by the api process itself, so any `.log` file
  // that hasn't been written to in a while is safe to treat as finalized —
  // see the mtime guard below).
  const rotatedLogFiles = entries.filter((f) => f.endsWith('.log'));

  // --- Stage 1: compress finalized .log files into .gz ---
  for (const file of rotatedLogFiles) {
    const parsed = parseBucketFileName(file);
    if (!parsed) continue; // not a recognized bucket-named log file — leave it alone.

    const logPath = path.join(LOG_DIR, file);
    const stat = fs.statSync(logPath);
    // A file still being actively appended to typically has a very recent
    // mtime; guard against compressing the CURRENTLY active bucket file by
    // requiring it be untouched for at least one full idle-poll cycle.
    // RotatingLogDestination only stops writing to a file once its bucket
    // has elapsed, so once that boundary passes the file's mtime stops
    // advancing — a 2-minute quiet window is a safe, simple signal.
    if (now.getTime() - stat.mtimeMs < 2 * 60_000) continue;

    const gzFile = `${file}.gz`;
    const gzPath = path.join(LOG_DIR, gzFile);
    if (!isEligibleForRetry(state[file], now)) continue;

    try {
      await compressFile(logPath, gzPath);
      fs.unlinkSync(logPath); // Part 8/15 — raw file removed only after compression succeeds.
      delete state[file];
      summary.compressed += 1;
      logger.info({ file, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_COMPRESSED }, 'Rotated log compressed');
    } catch (error) {
      const dead = markFailure(state, file, now);
      if (dead) summary.deadLettered += 1;
      logger.error(
        { file, error, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_COMPRESSION_FAILED },
        'Failed to compress rotated log — will retry',
      );
    }
  }

  // --- Stage 2: upload .gz archives ---
  // Three independent gates: the env-level kill switch, S3 actually being
  // configured, and the admin-facing "Upload Logs to S3" Control Panel
  // toggle (Website Design -> Storage & Retention) — any one of them being
  // off means archives stay local-only (still rotated/compressed/retained).
  const archivalEnabled =
    env.LOG_S3_ARCHIVAL_ENABLED && (await isS3Configured()) && (await shouldUploadLogsToS3());
  if (archivalEnabled) {
    const refreshedGzFiles = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log.gz'));
    for (const gzFile of refreshedGzFiles) {
      const parsed = parseBucketFileName(gzFile);
      if (!parsed) continue;
      if (!isEligibleForRetry(state[gzFile], now)) continue;

      const gzPath = path.join(LOG_DIR, gzFile);
      try {
        const buffer = fs.readFileSync(gzPath);
        const objectKey = buildLogObjectKey({ category: parsed.category, bucketLabel: parsed.bucketLabel });
        await uploadDocument({ buffer, objectKey, contentType: 'application/gzip' });
        fs.unlinkSync(gzPath); // Part 15 — local cleanup only after a CONFIRMED successful upload.
        delete state[gzFile];
        summary.uploaded += 1;
        logger.info(
          { file: gzFile, objectKey, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_UPLOADED },
          'Log archive uploaded to S3',
        );
      } catch (error) {
        const dead = markFailure(state, gzFile, now);
        summary.failed += 1;
        if (dead) {
          summary.deadLettered += 1;
          logger.error(
            { file: gzFile, error, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_DEAD_LETTERED },
            'Log archive upload permanently failed after max retries — left on local disk for manual recovery',
          );
        } else {
          logger.warn(
            { file: gzFile, error, nextRetryAt: state[gzFile]?.nextRetryAt, event: STORAGE_AUDIT_ACTIONS.LOG_ARCHIVE_UPLOAD_FAILED },
            'Failed to upload log archive to S3 — retry scheduled',
          );
        }
      }
    }
  }
  // else: archival disabled or S3 not configured. Logs still rotate/
  // compress locally (stage 1 always runs); they accumulate as local `.gz`
  // files, bounded by the local-retention/disk-protection stages below
  // rather than being discarded outright.

  // --- Stage 3: local-only retention ceiling for undeliverable archives ---
  // A dead-lettered file (exhausted every retry) or one produced while
  // archival is disabled/unconfigured has no further automatic path to S3 —
  // without this it would sit on local disk forever ("manual recovery").
  // Never touches a file still within its retry backoff window.
  summary.localRetentionDeleted += enforceLocalRetention(state, archivalEnabled, now);

  // --- Stage 4: hard disk-protection ceiling ---
  // Re-reads the directory since stages 1-3 may have changed it; only ever
  // removes dead-lettered files, oldest first, and only enough to get back
  // under the configured limit.
  const finalEntries = fs.readdirSync(LOG_DIR);
  summary.localRetentionDeleted += enforceDiskProtection(
    state,
    finalEntries.filter((f) => f.endsWith('.log.gz')),
    finalEntries.filter((f) => f.endsWith('.log')),
  );

  saveState(state);
  return summary;
}

/** Entry point registered in maintenance.worker.ts's HANDLERS map. Wraps the run in a BACKGROUND_JOB context (Part 31/32) so every log line this produces — including nested StorageService calls — carries a job identity, never a human actor. */
export async function runLogArchivalJob(): Promise<number> {
  return runWithJobContext('log-archival', Date.now(), async () => {
    const summary = await runOnce();
    const total = summary.compressed + summary.uploaded;
    if (total > 0 || summary.failed > 0 || summary.deadLettered > 0 || summary.localRetentionDeleted > 0) {
      await recordAudit({
        actorId: null,
        actorType: ACTOR_TYPES.BACKGROUND_JOB,
        action: STORAGE_AUDIT_ACTIONS.LOG_BATCH_UPLOADED,
        resource: 'log',
        metadata: summary,
      });
    }
    return summary.uploaded;
  });
}
