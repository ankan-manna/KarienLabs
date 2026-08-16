import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashesMatch, hashToken } from './token-hash.util';

test('hashToken is deterministic for the same input', () => {
  assert.equal(hashToken('123456'), hashToken('123456'));
});

test('hashToken differs for different inputs', () => {
  assert.notEqual(hashToken('123456'), hashToken('654321'));
});

test('hashesMatch is true for equal hashes and false for unequal ones', () => {
  const a = hashToken('123456');
  const b = hashToken('123456');
  const c = hashToken('000000');
  assert.equal(hashesMatch(a, b), true);
  assert.equal(hashesMatch(a, c), false);
});

test('hashesMatch returns false (not throws) on length mismatch — guards against a malformed/truncated stored hash', () => {
  assert.equal(hashesMatch('ab', hashToken('123456')), false);
});
