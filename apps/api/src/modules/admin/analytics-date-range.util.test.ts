import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateRangeMatchStage, resolveAnalyticsDateRange } from './analytics-date-range.util';

// A fixed instant for deterministic tests: 2026-08-15T14:30:00.000Z (a Saturday).
const NOW = new Date('2026-08-15T14:30:00.000Z');

test('no params at all defaults to a BOUNDED last30days range, never unbounded', () => {
  const range = resolveAnalyticsDateRange({}, NOW);
  assert.equal(range.preset, 'last30days');
  assert.equal(range.from.toISOString(), '2026-07-17T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-15T23:59:59.999Z');
});

test('today resolves to the full UTC calendar day', () => {
  const range = resolveAnalyticsDateRange({ preset: 'today' }, NOW);
  assert.equal(range.from.toISOString(), '2026-08-15T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-15T23:59:59.999Z');
});

test('yesterday resolves to the previous UTC calendar day', () => {
  const range = resolveAnalyticsDateRange({ preset: 'yesterday' }, NOW);
  assert.equal(range.from.toISOString(), '2026-08-14T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-14T23:59:59.999Z');
});

test('last7days includes today and the 6 days before it (7 total)', () => {
  const range = resolveAnalyticsDateRange({ preset: 'last7days' }, NOW);
  assert.equal(range.from.toISOString(), '2026-08-09T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-15T23:59:59.999Z');
});

test('currentMonth starts on the 1st of the current UTC month', () => {
  const range = resolveAnalyticsDateRange({ preset: 'currentMonth' }, NOW);
  assert.equal(range.from.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-15T23:59:59.999Z');
});

test('previousMonth is the FULL previous calendar month, not a rolling 30 days', () => {
  const range = resolveAnalyticsDateRange({ preset: 'previousMonth' }, NOW);
  assert.equal(range.from.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-07-31T23:59:59.999Z');
});

test('previousMonth correctly rolls back across a year boundary (January)', () => {
  const janNow = new Date('2026-01-15T00:00:00.000Z');
  const range = resolveAnalyticsDateRange({ preset: 'previousMonth' }, janNow);
  assert.equal(range.from.toISOString(), '2025-12-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2025-12-31T23:59:59.999Z');
});

test('currentYear starts January 1st of the current UTC year', () => {
  const range = resolveAnalyticsDateRange({ preset: 'currentYear' }, NOW);
  assert.equal(range.from.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-15T23:59:59.999Z');
});

test('previousYear is the FULL previous calendar year', () => {
  const range = resolveAnalyticsDateRange({ preset: 'previousYear' }, NOW);
  assert.equal(range.from.toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2025-12-31T23:59:59.999Z');
});

test('custom range with explicit from/to is honored exactly', () => {
  const range = resolveAnalyticsDateRange({ from: '2026-01-01', to: '2026-01-31' }, NOW);
  assert.equal(range.preset, 'custom');
  assert.equal(range.from.toISOString(), '2026-01-01T00:00:00.000Z');
});

test('custom range rejects "from" after "to"', () => {
  assert.throws(
    () => resolveAnalyticsDateRange({ preset: 'custom', from: '2026-02-01', to: '2026-01-01' }, NOW),
    /INVALID_DATE_RANGE|before/,
  );
});

test('custom range rejects a range exceeding the max allowed days (Part 43 — abuse protection)', () => {
  assert.throws(
    () => resolveAnalyticsDateRange({ preset: 'custom', from: '2020-01-01', to: '2026-01-01' }, NOW),
    /cannot exceed/,
  );
});

test('custom preset requires BOTH from and to', () => {
  assert.throws(() => resolveAnalyticsDateRange({ preset: 'custom', from: '2026-01-01' }, NOW), /requires both/);
});

test('custom range rejects an unparseable date string', () => {
  assert.throws(
    () => resolveAnalyticsDateRange({ preset: 'custom', from: 'not-a-date', to: '2026-01-01' }, NOW),
    /Invalid/,
  );
});

test('rejects an unknown preset name', () => {
  assert.throws(() => resolveAnalyticsDateRange({ preset: 'nextCentury' }, NOW), /Unknown date range preset/);
});

test('dateRangeMatchStage always applies BOTH bounds (never an unbounded query)', () => {
  const range = resolveAnalyticsDateRange({ preset: 'today' }, NOW);
  const stage = dateRangeMatchStage(range);
  assert.deepEqual(Object.keys(stage), ['createdAt']);
  assert.deepEqual(Object.keys(stage.createdAt as object), ['$gte', '$lte']);
});

test('dateRangeMatchStage supports a custom field name', () => {
  const range = resolveAnalyticsDateRange({ preset: 'today' }, NOW);
  const stage = dateRangeMatchStage(range, 'sentAt');
  assert.deepEqual(Object.keys(stage), ['sentAt']);
});
