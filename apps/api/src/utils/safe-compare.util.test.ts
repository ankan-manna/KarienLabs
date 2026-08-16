import assert from 'node:assert/strict';
import { test } from 'node:test';

import { safeCompare } from './safe-compare.util';

test('returns true for identical strings', () => {
  assert.equal(safeCompare('secret-token-value', 'secret-token-value'), true);
});

test('returns false for different strings of the same length', () => {
  assert.equal(safeCompare('secret-token-value', 'secret-token-VALUE'), false);
});

test('returns false for different-length strings (no length-based short-circuit exception)', () => {
  assert.equal(safeCompare('short', 'a-much-longer-string'), false);
});

test('returns false comparing against an empty string', () => {
  assert.equal(safeCompare('nonempty', ''), false);
});

test('two empty strings are equal', () => {
  assert.equal(safeCompare('', ''), true);
});
