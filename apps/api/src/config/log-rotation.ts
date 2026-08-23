import fs from 'node:fs';
import path from 'node:path';

import SonicBoom from 'sonic-boom';

/**
 * Part 1/28/29 — wall-clock-aligned log rotation shared by every
 * log category (application / third-party-api / pool-stats). Deliberately
 * built as pure date math + a thin SonicBoom wrapper rather than reaching
 * for a Java-style `TimeBasedTriggeringPolicy`: SonicBoom (pino's own
 * non-blocking file-writer, already a transitive dependency — see
 * package.json) exposes exactly the primitive a rotation policy needs,
 * `reopen(newPath)`, which atomically starts writing to a fresh file while
 * the previous one stays fully flushed and untouched.
 */

/** `YYYY-MM-DD-HH` where HH is the START hour of the bucket the given instant falls into, e.g. 07:41 with a 6h rotation -> bucket "06". */
export function formatBucketLabel(date: Date, timezone: string, rotationHours: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Intl can format midnight as "24" in some locales/engines — normalize to 0.
  const rawHour = Number(get('hour')) % 24;
  const bucketStartHour = Math.floor(rawHour / rotationHours) * rotationHours;

  return `${year}-${month}-${day}-${String(bucketStartHour).padStart(2, '0')}`;
}

/** `logs/{category}-{bucketLabel}.log` — the local, deterministic-per-bucket filename every archival job (log-archival.job.ts) and this rotator agree on. */
export function bucketFilePath(logDir: string, category: string, bucketLabel: string): string {
  return path.join(logDir, `${category}-${bucketLabel}.log`);
}

/** Matches `{category}-{YYYY-MM-DD-HH}.log` produced by bucketFilePath, used by both the archival job and startup recovery to find finalized (non-active) rotated files. */
export const BUCKET_FILE_PATTERN = /^(.+)-(\d{4}-\d{2}-\d{2}-\d{2})\.log$/;

export interface RotatingLogDestinationOptions {
  logDir: string;
  category: string;
  timezone: string;
  rotationHours: number;
  /** Called (fire-and-forget, never awaited here) with the just-finalized file's path whenever a rotation happens. Non-blocking — hands off to the archival worker rather than compressing/uploading inline (Part 6/17). */
  onRotate?: (finishedFilePath: string) => void;
  /** Idle-period safety net — rotation is also checked on this cadence so a quiet service still rotates exactly at the wall-clock boundary (Part 1), not just on next log line. */
  idlePollMs?: number;
}

/**
 * A pino-compatible `DestinationStream` (only needs `.write(str): boolean`)
 * that transparently rotates its underlying file at 6-hour wall-clock
 * boundaries. Runs in the MAIN thread but writes are non-blocking — SonicBoom
 * itself buffers and flushes off the JS event loop (the same mechanism pino
 * uses internally), so this never blocks a request/response cycle (Part 6).
 */
export class RotatingLogDestination {
  private sonic: SonicBoom;
  private currentBucketLabel: string;
  private readonly opts: Required<Omit<RotatingLogDestinationOptions, 'onRotate'>> &
    Pick<RotatingLogDestinationOptions, 'onRotate'>;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(opts: RotatingLogDestinationOptions) {
    this.opts = { idlePollMs: 30_000, ...opts };
    fs.mkdirSync(this.opts.logDir, { recursive: true });
    this.currentBucketLabel = formatBucketLabel(new Date(), this.opts.timezone, this.opts.rotationHours);
    this.sonic = new SonicBoom({
      dest: bucketFilePath(this.opts.logDir, this.opts.category, this.currentBucketLabel),
      mkdir: true,
      append: true, // a restart mid-bucket must resume the SAME bucket file, never truncate it (Part 38/39).
    });

    // Idle-safety-net: catches the boundary crossing even when nothing is
    // actively being logged (Part 1 — rotation must not depend on traffic).
    this.pollTimer = setInterval(() => this.checkRotate(), this.opts.idlePollMs);
    this.pollTimer.unref(); // never keeps the process alive on its own.
  }

  /** Cheap (single Intl format) check run on every write and on the idle timer; only does real I/O when the bucket has actually changed. */
  private checkRotate(): void {
    const nowLabel = formatBucketLabel(new Date(), this.opts.timezone, this.opts.rotationHours);
    if (nowLabel === this.currentBucketLabel) return;

    const finishedPath = bucketFilePath(this.opts.logDir, this.opts.category, this.currentBucketLabel);
    const nextPath = bucketFilePath(this.opts.logDir, this.opts.category, nowLabel);
    this.currentBucketLabel = nowLabel;

    // reopen() flushes + closes the fd at the OLD path and opens a fresh one
    // at nextPath — the old bucket file is left exactly as-is, fully
    // flushed, under its own permanent bucket-stamped name (no rename step,
    // no race window — Part 29).
    this.sonic.reopen(nextPath);

    if (this.opts.onRotate) {
      try {
        this.opts.onRotate(finishedPath);
      } catch {
        // Archival hand-off must never be able to break logging itself (Part 35).
      }
    }
  }

  write(msg: string): boolean {
    this.checkRotate();
    return this.sonic.write(msg);
  }

  flush(cb?: (err?: Error) => void): void {
    this.sonic.flush(cb);
  }

  /** Part 39 — graceful shutdown: flush synchronously so nothing buffered is lost before process exit. */
  flushSync(): void {
    try {
      this.sonic.flushSync();
    } catch {
      // Best-effort — a flush failure during shutdown must not prevent exit.
    }
  }

  end(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.sonic.end();
  }

  get activeFilePath(): string {
    return bucketFilePath(this.opts.logDir, this.opts.category, this.currentBucketLabel);
  }
}
