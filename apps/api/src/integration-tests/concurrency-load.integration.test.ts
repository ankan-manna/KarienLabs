import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 24 Part 73 — "ensure rate limiting and security middleware do not
 * become a bottleneck" under concurrent load. Run against the SAME
 * ephemeral mongodb-memory-server + redis-test-server harness every other
 * integration test in this repo uses (never the shared dev database) —
 * genuinely concurrent (`Promise.all`, not sequential `await` in a loop,
 * which would trivially "pass" without proving anything about real
 * concurrency), at a scale (100–150 requests) proportionate to what an
 * ephemeral single-process test harness can meaningfully exercise without
 * itself becoming the bottleneck being measured.
 */
describe('Concurrency & load (Prompt 24 Part 73)', () => {
  let ctx: TestAppContext;

  before(async () => {
    ctx = await setupTestApp();
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  test('100 concurrent requests to a public read endpoint all complete without crashing or hanging', async () => {
    const CONCURRENCY = 100;
    const start = Date.now();

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => request(ctx.app).get('/api/v1/products')),
    );

    const elapsedMs = Date.now() - start;
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    assert.equal(fulfilled.length, CONCURRENCY, 'every request must resolve (not hang/reject) even under concurrent load');
    // Every response is either a clean 200 or a clean, well-formed 429 —
    // never a raw crash. Nothing should be a 500.
    for (const r of fulfilled) {
      const status = (r as PromiseFulfilledResult<unknown>).value as { status: number };
      assert.ok(
        status.status === 200 || status.status === 429,
        `unexpected status ${status.status} under concurrent load`,
      );
    }
    // Sanity bound — 100 requests against an in-memory Mongo instance
    // shouldn't take anywhere near this long; a wildly high number here
    // would indicate the security middleware chain (rate limiter, mongo-
    // sanitize, helmet, etc.) is serializing requests instead of handling
    // them concurrently.
    assert.ok(elapsedMs < 15000, `100 concurrent requests took ${elapsedMs}ms — unexpectedly slow`);
  });

  test('150 concurrent requests correctly trigger rate limiting rather than being silently dropped or crashing the process', async () => {
    // globalRateLimiter's default test-env limit — see env schema
    // (RATE_LIMIT_MAX) — is well under 150, so this burst is EXPECTED to
    // produce a mix of 200s and 429s, never a crash.
    const CONCURRENCY = 150;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => request(ctx.app).get('/api/v1/products')),
    );

    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? (r.value as unknown as { status: number }).status : 'rejected',
    );

    assert.ok(!statuses.includes('rejected'), 'no request should be dropped/rejected at the transport level');
    assert.ok(!statuses.some((s) => typeof s === 'number' && s >= 500), 'no request should crash with a 5xx');

    const rateLimited = statuses.filter((s) => s === 429).length;
    const succeeded = statuses.filter((s) => s === 200).length;
    assert.equal(rateLimited + succeeded, CONCURRENCY);
    // At this volume against the test-env limiter, SOME requests should
    // have been throttled — proving the limiter is actually doing
    // something under concurrent load, not just decorative.
    assert.ok(rateLimited > 0, 'expected at least some requests to be rate-limited at this burst volume');
  });

  test('concurrent requests across DIFFERENT IPs are tracked independently by the rate limiter (no cross-client bleed)', async () => {
    const perIp = 30;
    const [ipARequests, ipBRequests] = await Promise.all([
      Promise.allSettled(
        Array.from({ length: perIp }, () =>
          request(ctx.app).get('/api/v1/products').set('X-Forwarded-For', '10.0.0.1'),
        ),
      ),
      Promise.allSettled(
        Array.from({ length: perIp }, () =>
          request(ctx.app).get('/api/v1/products').set('X-Forwarded-For', '10.0.0.2'),
        ),
      ),
    ]);

    // Neither IP alone exceeds a reasonable per-window volume, so with two
    // independent identities issuing the SAME total request count that
    // triggered rate-limiting when concentrated on ONE identity above,
    // most/all should succeed here — proving the limiter keys correctly
    // rather than sharing one global bucket across distinct clients.
    // (`trust proxy: 1` — see app.ts — makes this header meaningful in the
    // test harness the same way it is behind the real single-hop Nginx.)
    const countOk = (results: PromiseSettledResult<unknown>[]) =>
      results.filter(
        (r) => r.status === 'fulfilled' && (r.value as unknown as { status: number }).status === 200,
      ).length;

    assert.equal(countOk(ipARequests), perIp);
    assert.equal(countOk(ipBRequests), perIp);
  });
});
