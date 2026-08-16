import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveEffectiveBatchMrp } from './batch-pricing.util';

test('resolveEffectiveBatchMrp uses batch.mrp when set', () => {
  assert.equal(resolveEffectiveBatchMrp({ mrp: 110 }, { mrp: 100 }), 110);
});

test('resolveEffectiveBatchMrp falls back to product.mrp when batch.mrp is null', () => {
  assert.equal(resolveEffectiveBatchMrp({ mrp: null }, { mrp: 100 }), 100);
});

test('resolveEffectiveBatchMrp falls back to product.mrp when batch is missing entirely', () => {
  assert.equal(resolveEffectiveBatchMrp(undefined, { mrp: 100 }), 100);
  assert.equal(resolveEffectiveBatchMrp(null, { mrp: 100 }), 100);
});

test('resolveEffectiveBatchMrp treats batch.mrp = 0 as a real override, not "unset"', () => {
  // 0 is a valid (if unusual) explicit override — only null/undefined mean "unset".
  assert.equal(resolveEffectiveBatchMrp({ mrp: 0 }, { mrp: 100 }), 0);
});
