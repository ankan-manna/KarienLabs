import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import request from 'supertest';

import { setupTestApp, type TestAppContext } from '../test-support/test-app';

/** Prompt 24 Part 7/39/62 — security-header regression tests at the real HTTP layer. */
describe('Security response headers (Prompt 24)', () => {
  let ctx: TestAppContext;

  before(async () => {
    ctx = await setupTestApp();
  });

  after(async () => {
    await ctx.teardown();
  });

  test('every /api/v1 response carries Cache-Control: no-store (Part 62)', async () => {
    const res = await request(ctx.app).get('/api/v1/products');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['pragma'], 'no-cache');
  });

  test('helmet security headers are present (Part 7/39)', async () => {
    const res = await request(ctx.app).get('/api/v1/products');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy'], 'expected a Content-Security-Policy header');
    assert.ok(!('x-powered-by' in res.headers), 'X-Powered-By should be disabled');
  });

  test('CORS does not echo back an arbitrary Origin (Part 5/6 — no wildcard-with-credentials)', async () => {
    const res = await request(ctx.app).options('/api/v1/products').set('Origin', 'https://evil.example.com');
    const allowOrigin = res.headers['access-control-allow-origin'];
    assert.notEqual(allowOrigin, '*');
    assert.notEqual(allowOrigin, 'https://evil.example.com');
  });

  test('the sitemap/robots endpoints (outside /api/v1) are NOT forced no-store — they are meant to be cached by crawlers', async () => {
    const res = await request(ctx.app).get('/robots.txt');
    assert.notEqual(res.headers['cache-control'], 'no-store');
  });
});
