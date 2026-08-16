import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateOtpCode } from './otp.util';

test('generateOtpCode produces a zero-padded numeric string of the requested length', () => {
  for (const length of [4, 6, 8]) {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode(length);
      assert.equal(code.length, length, `expected length ${length}, got "${code}"`);
      assert.match(code, /^\d+$/, `expected only digits, got "${code}"`);
    }
  }
});

test('generateOtpCode is not trivially constant (basic sanity, not a full randomness test)', () => {
  const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode(6)));
  assert.ok(codes.size > 1, 'expected at least some variation across 20 draws');
});
