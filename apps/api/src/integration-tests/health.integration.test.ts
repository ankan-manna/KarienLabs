import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import request from 'supertest';

import { setupTestApp, type TestAppContext } from '../test-support/test-app';

/** Part 49/50/51 — liveness vs readiness split. */
describe('Health checks', () => {
  let ctx: TestAppContext;

  before(async () => {
    ctx = await setupTestApp();
  });

  after(async () => {
    await ctx.teardown();
  });

  test('GET /health (legacy path, still used by Docker HEALTHCHECK) returns 200 without checking dependencies', async () => {
    const res = await request(ctx.app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('GET /health/live is an alias for the same liveness check', async () => {
    const res = await request(ctx.app).get('/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('GET /health/ready returns 200 with per-dependency checks when Mongo+Redis are up', async () => {
    const res = await request(ctx.app).get('/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.equal(res.body.checks.mongo, true);
    assert.equal(res.body.checks.redis, true);
  });

  test('health endpoints are not behind authentication', async () => {
    // No Authorization header at all — a probe/load-balancer has no credentials.
    const res = await request(ctx.app).get('/health/ready');
    assert.notEqual(res.status, 401);
  });
});
