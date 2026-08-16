import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getRequestContext,
  runWithJobContext,
  runWithRequestContext,
  updateRequestContext,
} from './request-context';

// Prompt 18 Part 4/30/31/32/50 — AsyncLocalStorage-based correlation, the
// mechanism that lets requestId/actor/job identity reach every log line
// without threading parameters through every service function signature.

test('getRequestContext returns undefined outside any active context', () => {
  assert.equal(getRequestContext(), undefined);
});

test('runWithRequestContext: the context is visible inside the callback', () => {
  runWithRequestContext({ requestId: 'req-1', tenant: 'default' }, () => {
    const ctx = getRequestContext();
    assert.equal(ctx?.requestId, 'req-1');
    assert.equal(ctx?.tenant, 'default');
  });
});

test('runWithRequestContext: the SAME context object survives across await boundaries (Part 30 — one requestId per request, not per log line)', async () => {
  async function nestedServiceCall() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return getRequestContext()?.requestId;
  }

  await runWithRequestContext({ requestId: 'req-async-1', tenant: 'default' }, async () => {
    const seenInService = await nestedServiceCall();
    assert.equal(seenInService, 'req-async-1');
  });
});

test('updateRequestContext: mutates the active context in place (simulates requireAuth resolving actor identity mid-request)', () => {
  runWithRequestContext({ requestId: 'req-2', tenant: 'default' }, () => {
    updateRequestContext({ actorId: 'user-42', actorType: 'user', role: 'admin' });
    const ctx = getRequestContext();
    assert.equal(ctx?.requestId, 'req-2'); // untouched
    assert.equal(ctx?.actorId, 'user-42');
    assert.equal(ctx?.role, 'admin');
  });
});

test('updateRequestContext: a no-op outside any active context (never throws)', () => {
  assert.doesNotThrow(() => updateRequestContext({ actorId: 'x' }));
});

test('contexts do not leak between two concurrent runs (no shared mutable state across requests)', async () => {
  const results: string[] = [];
  await Promise.all([
    runWithRequestContext({ requestId: 'req-A', tenant: 'default' }, async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(getRequestContext()!.requestId);
    }),
    runWithRequestContext({ requestId: 'req-B', tenant: 'default' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      results.push(getRequestContext()!.requestId);
    }),
  ]);
  assert.ok(results.includes('req-A'));
  assert.ok(results.includes('req-B'));
});

test('runWithJobContext: background jobs identify themselves as BACKGROUND_JOB, never a human actor (Part 31)', () => {
  runWithJobContext('log-archival', 123, () => {
    const ctx = getRequestContext();
    assert.equal(ctx?.actorType, 'BACKGROUND_JOB');
    assert.equal(ctx?.jobId, '123');
    assert.equal(ctx?.jobName, 'log-archival');
    assert.equal(ctx?.requestId, 'job-log-archival-123');
  });
});
