import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeBackoffDelayMs,
  isDeadLetter,
  isEligibleForRetry,
  parseBucketFileName,
} from './log-archival.util';

// Prompt 18 Part 36/50 — retry/backoff policy is pure math, tested without any fs/S3.

test('computeBackoffDelayMs: grows exponentially with attempts (fixed jitter=1 for a deterministic upper bound)', () => {
  const fixedRandom = () => 1; // pins jitterFactor to 1.0 (the max of the 0.5-1.0 range)
  const d0 = computeBackoffDelayMs(0, 1000, 1_000_000, fixedRandom);
  const d1 = computeBackoffDelayMs(1, 1000, 1_000_000, fixedRandom);
  const d2 = computeBackoffDelayMs(2, 1000, 1_000_000, fixedRandom);
  assert.equal(d0, 1000);
  assert.equal(d1, 2000);
  assert.equal(d2, 4000);
});

test('computeBackoffDelayMs: never exceeds the configured cap', () => {
  const delay = computeBackoffDelayMs(20, 1000, 60_000, () => 1);
  assert.equal(delay, 60_000);
});

test('computeBackoffDelayMs: jitter keeps the delay within [50%, 100%] of the capped value', () => {
  const low = computeBackoffDelayMs(3, 1000, 1_000_000, () => 0);
  const high = computeBackoffDelayMs(3, 1000, 1_000_000, () => 1);
  assert.equal(low, 4000); // 8000 * 0.5
  assert.equal(high, 8000); // 8000 * 1.0
});

test('isDeadLetter: true once attempts reach the configured retry limit', () => {
  assert.equal(isDeadLetter(7, 8), false);
  assert.equal(isDeadLetter(8, 8), true);
  assert.equal(isDeadLetter(9, 8), true);
});

test('isEligibleForRetry: a file with no prior state is immediately eligible', () => {
  assert.equal(isEligibleForRetry(undefined), true);
});

test('isEligibleForRetry: not eligible before its backoff window elapses', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const state = {
    attempts: 1,
    lastAttemptAt: now.toISOString(),
    nextRetryAt: new Date('2026-08-08T12:05:00Z').toISOString(),
    dead: false,
  };
  assert.equal(isEligibleForRetry(state, now), false);
  assert.equal(isEligibleForRetry(state, new Date('2026-08-08T12:05:01Z')), true);
});

test('isEligibleForRetry: a dead-lettered file is never eligible again automatically', () => {
  const state = {
    attempts: 8,
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt: new Date(0).toISOString(), // window long past
    dead: true,
  };
  assert.equal(isEligibleForRetry(state, new Date()), false);
});

test('parseBucketFileName: parses a raw rotated .log filename', () => {
  const result = parseBucketFileName('api-application-2026-08-08-06.log');
  assert.deepEqual(result, { category: 'api-application', bucketLabel: '2026-08-08-06' });
});

test('parseBucketFileName: parses a compressed .log.gz filename identically', () => {
  const result = parseBucketFileName('api-application-2026-08-08-06.log.gz');
  assert.deepEqual(result, { category: 'api-application', bucketLabel: '2026-08-08-06' });
});

test('parseBucketFileName: returns null for an unrelated filename (e.g. the sidecar state file)', () => {
  assert.equal(parseBucketFileName('.archival-state.json'), null);
});
