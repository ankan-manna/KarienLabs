import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_ANALYTICS_CONFIG, validateAnalyticsConfig, type AnalyticsConfig } from './analytics-config.util';

test('default config passes validation', () => {
  assert.doesNotThrow(() => validateAnalyticsConfig(DEFAULT_ANALYTICS_CONFIG));
});

test('platformHealthAnalyticsEnabled defaults to false (more sensitive than ordinary reports)', () => {
  assert.equal(DEFAULT_ANALYTICS_CONFIG.platformHealthAnalyticsEnabled, false);
});

test('rejects an unknown configuration key', () => {
  const next = { ...DEFAULT_ANALYTICS_CONFIG, unknownField: true } as unknown as AnalyticsConfig;
  assert.throws(() => validateAnalyticsConfig(next), /Unknown analytics configuration key/);
});

test('no domain toggle can stay on while the master switch is off', () => {
  const next: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG, analyticsEnabled: false };
  assert.throws(() => validateAnalyticsConfig(next), /Cannot enable .*while analytics is disabled/);
});

test('reports every offending domain key in the error, not just the first', () => {
  const next: AnalyticsConfig = {
    ...DEFAULT_ANALYTICS_CONFIG,
    analyticsEnabled: false,
    salesAnalyticsEnabled: true,
    orderAnalyticsEnabled: true,
  };
  assert.throws(() => validateAnalyticsConfig(next), /salesAnalyticsEnabled.*orderAnalyticsEnabled/);
});

test('everything off is a valid, safe transition', () => {
  const next: AnalyticsConfig = Object.fromEntries(
    Object.keys(DEFAULT_ANALYTICS_CONFIG).map((k) => [k, false]),
  ) as unknown as AnalyticsConfig;
  assert.doesNotThrow(() => validateAnalyticsConfig(next));
});

test('a single domain can be disabled while master + other domains stay on', () => {
  const next: AnalyticsConfig = { ...DEFAULT_ANALYTICS_CONFIG, prescriptionAnalyticsEnabled: false };
  assert.doesNotThrow(() => validateAnalyticsConfig(next));
});
