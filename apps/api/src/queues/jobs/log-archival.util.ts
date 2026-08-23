import { BUCKET_FILE_PATTERN } from '../../config/log-rotation';

/**
 * Part 36 — pure retry/backoff math, split out from
 * log-archival.job.ts (which touches fs/S3) so it's unit-testable without
 * mocking either, mirroring the established pure/impure split used
 * throughout this codebase (e.g. prescription-config.util.ts).
 */

export interface ArchivalFileState {
  attempts: number;
  lastAttemptAt: string; // ISO
  nextRetryAt: string; // ISO
  dead: boolean;
}

export type ArchivalStateMap = Record<string, ArchivalFileState>;

/** Exponential backoff with jitter, capped at `maxMs`. `randomFn` is injectable so tests can assert exact bounds instead of a random range. */
export function computeBackoffDelayMs(
  attempts: number,
  baseMs = 60_000,
  maxMs = 6 * 60 * 60_000,
  randomFn: () => number = Math.random,
): number {
  const raw = baseMs * 2 ** Math.max(0, attempts);
  const capped = Math.min(raw, maxMs);
  const jitterFactor = 0.5 + randomFn() * 0.5; // 50%-100% of the capped delay
  return Math.round(capped * jitterFactor);
}

export function isDeadLetter(attempts: number, retryLimit: number): boolean {
  return attempts >= retryLimit;
}

/** Whether `state`'s backoff window has elapsed, i.e. this file is eligible to be retried right now. */
export function isEligibleForRetry(state: ArchivalFileState | undefined, now: Date = new Date()): boolean {
  if (!state) return true;
  if (state.dead) return false;
  return now.getTime() >= new Date(state.nextRetryAt).getTime();
}

/** `{category}-{YYYY-MM-DD-HH}.log` or `.log.gz` -> `{category, bucketLabel}`, or null if the filename doesn't match the deterministic rotation naming (Part 29). */
export function parseBucketFileName(fileName: string): { category: string; bucketLabel: string } | null {
  const withoutGz = fileName.endsWith('.gz') ? fileName.slice(0, -3) : fileName;
  const match = withoutGz.match(BUCKET_FILE_PATTERN);
  if (!match) return null;
  return { category: match[1], bucketLabel: match[2] };
}
