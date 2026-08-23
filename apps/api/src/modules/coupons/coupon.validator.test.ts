import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCouponSchema, updateCouponSchema } from './coupon.validator';

const validBase = {
  code: 'SAVE20',
  type: 'percentage',
  value: 20,
  validFrom: '2026-01-01T00:00:00Z',
  validTo: '2026-12-31T00:00:00Z',
};

 // Part 39 — invalid combinations the admin form must never submit.

test('accepts a well-formed percentage coupon', () => {
  const result = createCouponSchema.safeParse(validBase);
  assert.equal(result.success, true);
});

test('rejects a percentage discount over 100%', () => {
  const result = createCouponSchema.safeParse({ ...validBase, value: 150 });
  assert.equal(result.success, false);
});

test('accepts exactly 100% (boundary)', () => {
  const result = createCouponSchema.safeParse({ ...validBase, value: 100 });
  assert.equal(result.success, true);
});

test('a flat discount above 100 is fine (only percentage is capped)', () => {
  const result = createCouponSchema.safeParse({ ...validBase, type: 'flat', value: 5000 });
  assert.equal(result.success, true);
});

test('rejects a negative discount value', () => {
  const result = createCouponSchema.safeParse({ ...validBase, value: -10 });
  assert.equal(result.success, false);
});

test('rejects an end date before the start date', () => {
  const result = createCouponSchema.safeParse({
    ...validBase,
    validFrom: '2026-06-01T00:00:00Z',
    validTo: '2026-01-01T00:00:00Z',
  });
  assert.equal(result.success, false);
});

test('rejects an end date equal to the start date', () => {
  const result = createCouponSchema.safeParse({
    ...validBase,
    validFrom: '2026-06-01T00:00:00Z',
    validTo: '2026-06-01T00:00:00Z',
  });
  assert.equal(result.success, false);
});

test('rejects a negative minimum order value', () => {
  const result = createCouponSchema.safeParse({ ...validBase, minCartValue: -1 });
  assert.equal(result.success, false);
});

test('rejects a negative usage limit', () => {
  const result = createCouponSchema.safeParse({ ...validBase, usageLimitGlobal: -5 });
  assert.equal(result.success, false);
});

test('rejects a negative priority', () => {
  const result = createCouponSchema.safeParse({ ...validBase, priority: -1 });
  assert.equal(result.success, false);
});

test('updateCouponSchema allows a partial patch (no dates required)', () => {
  const result = updateCouponSchema.safeParse({ isActive: false });
  assert.equal(result.success, true);
});

test('updateCouponSchema still rejects an over-100% percentage patch when type is included', () => {
  const result = updateCouponSchema.safeParse({ type: 'percentage', value: 200 });
  assert.equal(result.success, false);
});
