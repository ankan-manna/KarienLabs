import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_COUPON_CONFIG, validateCouponConfig, type CouponConfig } from './coupon-config.util';

test('default config passes validation', () => {
  assert.doesNotThrow(() => validateCouponConfig(DEFAULT_COUPON_CONFIG));
});

test('rejects an unknown configuration key', () => {
  const next = { ...DEFAULT_COUPON_CONFIG, unknownField: true } as unknown as CouponConfig;
  assert.throws(() => validateCouponConfig(next), /Unknown coupon configuration key/);
});

test('firstOrderCouponEnabled cannot stay on while managementEnabled is off', () => {
  const next: CouponConfig = { managementEnabled: false, firstOrderCouponEnabled: true };
  assert.throws(() => validateCouponConfig(next), /Cannot enable firstOrderCouponEnabled/);
});

test('everything off is a valid, safe transition', () => {
  const next: CouponConfig = { managementEnabled: false, firstOrderCouponEnabled: false };
  assert.doesNotThrow(() => validateCouponConfig(next));
});

test('firstOrderCouponEnabled can be enabled while management is on', () => {
  const next: CouponConfig = { managementEnabled: true, firstOrderCouponEnabled: true };
  assert.doesNotThrow(() => validateCouponConfig(next));
});
