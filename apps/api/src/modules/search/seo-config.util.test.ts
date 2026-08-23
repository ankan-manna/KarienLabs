import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SEO_CONFIG, validateSeoConfig, type SeoConfig } from './seo-config.util';

test('default config passes validation', () => {
  assert.doesNotThrow(() => validateSeoConfig(DEFAULT_SEO_CONFIG));
});

test('rejects an unknown configuration key', () => {
  const next = { ...DEFAULT_SEO_CONFIG, unknownField: true } as unknown as SeoConfig;
  assert.throws(() => validateSeoConfig(next), /Unknown SEO configuration key/);
});

test('no SEO domain can stay on while the master switch is off', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, seoEnabled: false };
  assert.throws(() => validateSeoConfig(next), /Cannot enable .*while SEO is disabled/);
});

test('everything off is a valid, safe transition', () => {
  const next: SeoConfig = {
    ...DEFAULT_SEO_CONFIG,
    seoEnabled: false,
    productSeoEnabled: false,
    categorySeoEnabled: false,
    sitemapEnabled: false,
    robotsEnabled: false,
    structuredDataEnabled: false,
    canonicalEnabled: false,
    aeoEnabled: false,
    geoEnabled: false,
  };
  assert.doesNotThrow(() => validateSeoConfig(next));
});

test('a single domain can be disabled while master + other domains stay on', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, aeoEnabled: false };
  assert.doesNotThrow(() => validateSeoConfig(next));
});

test('rejects a non-positive numeric tunable', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, searchMaxResults: 0 };
  assert.throws(() => validateSeoConfig(next), /must be a positive number/);
});

test('rejects searchMinLength greater than searchMaxLength', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, searchMinLength: 10, searchMaxLength: 5 };
  assert.throws(() => validateSeoConfig(next), /cannot be greater than/);
});

test('rejects an abusive searchMaxLength (abuse protection)', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, searchMaxLength: 5000 };
  assert.throws(() => validateSeoConfig(next), /cannot exceed 200/);
});

test('rejects an abusive searchMaxResults', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, searchMaxResults: 100000 };
  assert.throws(() => validateSeoConfig(next), /cannot exceed 200/);
});

test('rejects an abusive suggestionLimit', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, suggestionLimit: 1000 };
  assert.throws(() => validateSeoConfig(next), /cannot exceed 25/);
});

test('rejects an abusive searchCacheDurationSeconds', () => {
  const next: SeoConfig = { ...DEFAULT_SEO_CONFIG, searchCacheDurationSeconds: 999999 };
  assert.throws(() => validateSeoConfig(next), /cannot exceed 3600/);
});
