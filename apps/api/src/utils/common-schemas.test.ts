import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gstinSchema, stateCodeSchema } from './common-schemas';

test('gstinSchema accepts a well-formed 15-character GSTIN', () => {
  const result = gstinSchema.safeParse('27ABCDE1234F1Z5');
  assert.equal(result.success, true);
});

test('gstinSchema uppercases a lowercase GSTIN', () => {
  const result = gstinSchema.safeParse('27abcde1234f1z5');
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data, '27ABCDE1234F1Z5');
});

test('gstinSchema rejects malformed GSTINs', () => {
  for (const bad of ['', 'not-a-gstin', '27ABCDE1234F1Z', '27ABCDE1234F1Z55', '12345678901234A']) {
    assert.equal(gstinSchema.safeParse(bad).success, false, `expected "${bad}" to be rejected`);
  }
});

test('stateCodeSchema accepts a 2-digit code and rejects anything else', () => {
  assert.equal(stateCodeSchema.safeParse('27').success, true);
  assert.equal(stateCodeSchema.safeParse('7').success, false);
  assert.equal(stateCodeSchema.safeParse('ABC').success, false);
  assert.equal(stateCodeSchema.safeParse('').success, false);
});
