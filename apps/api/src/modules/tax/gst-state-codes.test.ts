import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeStateToGstCode } from '@medcommerce/shared';

test('normalizeStateToGstCode: matches full state names case/whitespace-insensitively', () => {
  assert.equal(normalizeStateToGstCode('West Bengal'), '19');
  assert.equal(normalizeStateToGstCode('  west bengal  '), '19');
  assert.equal(normalizeStateToGstCode('ODISHA'), '21');
  assert.equal(normalizeStateToGstCode('Orissa'), '21'); // alternate spelling maps to the same code
});

test('normalizeStateToGstCode: matches common 2-letter abbreviations', () => {
  assert.equal(normalizeStateToGstCode('wb'), '19');
  assert.equal(normalizeStateToGstCode('MH'), '27');
  assert.equal(normalizeStateToGstCode('ka'), '29');
});

test('normalizeStateToGstCode: returns null (never throws) for unmatched free text', () => {
  assert.equal(normalizeStateToGstCode('Narnia'), null);
  assert.equal(normalizeStateToGstCode(''), null);
  assert.equal(normalizeStateToGstCode(null), null);
  assert.equal(normalizeStateToGstCode(undefined), null);
});
