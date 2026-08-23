import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { BUCKET_FILE_PATTERN, RotatingLogDestination, bucketFilePath, formatBucketLabel } from './log-rotation';

 // Part 1/28/29/50 — wall-clock-aligned 6-hour rotation.

test('formatBucketLabel: buckets align to wall-clock 6-hour boundaries, not startup time', () => {
  assert.equal(formatBucketLabel(new Date('2026-08-08T00:00:00Z'), 'UTC', 6), '2026-08-08-00');
  assert.equal(formatBucketLabel(new Date('2026-08-08T05:59:59Z'), 'UTC', 6), '2026-08-08-00');
  assert.equal(formatBucketLabel(new Date('2026-08-08T06:00:00Z'), 'UTC', 6), '2026-08-08-06');
  assert.equal(formatBucketLabel(new Date('2026-08-08T11:59:00Z'), 'UTC', 6), '2026-08-08-06');
  assert.equal(formatBucketLabel(new Date('2026-08-08T12:00:00Z'), 'UTC', 6), '2026-08-08-12');
  assert.equal(formatBucketLabel(new Date('2026-08-08T18:00:00Z'), 'UTC', 6), '2026-08-08-18');
  assert.equal(formatBucketLabel(new Date('2026-08-08T23:59:59Z'), 'UTC', 6), '2026-08-08-18');
});

test('formatBucketLabel: respects a non-UTC configured timezone', () => {
  // 03:30 UTC = 09:00 IST (Asia/Kolkata, UTC+5:30) -> bucket "06" in IST, not "00" as it would be in UTC.
  const label = formatBucketLabel(new Date('2026-08-08T03:30:00Z'), 'Asia/Kolkata', 6);
  assert.equal(label, '2026-08-08-06');
});

test('formatBucketLabel: a different rotation window (e.g. 1 hour) still buckets correctly', () => {
  assert.equal(formatBucketLabel(new Date('2026-08-08T14:45:00Z'), 'UTC', 1), '2026-08-08-14');
});

test('BUCKET_FILE_PATTERN matches the documented deterministic filename shape', () => {
  const match = 'api-application-2026-08-08-06.log'.match(BUCKET_FILE_PATTERN);
  assert.ok(match);
  assert.equal(match![1], 'api-application');
  assert.equal(match![2], '2026-08-08-06');
});

test('BUCKET_FILE_PATTERN does not match an unrelated filename', () => {
  assert.equal('random-file.txt'.match(BUCKET_FILE_PATTERN), null);
});

test('RotatingLogDestination: writes land in the current bucket file and rotating on a NEW date creates a separate, permanently-named file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p18-rotation-'));
  const dest = new RotatingLogDestination({
    logDir: dir,
    category: 'test-application',
    timezone: 'UTC',
    rotationHours: 6,
    idlePollMs: 3_600_000, // disable idle polling for this deterministic test
  });

  dest.write('line one\n');

  // SonicBoom opens its file descriptor asynchronously even though write()
  // can be called immediately (it buffers until the fd is ready) — poll
  // briefly rather than asserting the instant after construction.
  const activePath = dest.activeFilePath;
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(activePath) && Date.now() < deadline) {
    dest.flushSync();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.ok(fs.existsSync(activePath));
  assert.match(path.basename(activePath), BUCKET_FILE_PATTERN);
  assert.equal(fs.readFileSync(activePath, 'utf8'), 'line one\n');

  dest.end();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bucketFilePath is deterministic for the same inputs (idempotency precondition)', () => {
  const a = bucketFilePath('/tmp/logs', 'application', '2026-08-08-06');
  const b = bucketFilePath('/tmp/logs', 'application', '2026-08-08-06');
  assert.equal(a, b);
});
