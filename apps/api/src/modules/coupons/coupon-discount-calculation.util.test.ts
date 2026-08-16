import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateCouponDiscount, computeEligibleLines, type CouponRules } from './coupon-discount-calculation.util';

const baseRules: CouponRules = {
  type: 'flat',
  value: 100,
  maxDiscountAmount: null,
  applicableProductIds: [],
  applicableCategoryIds: [],
  excludedProductIds: [],
};

const lines = [
  { productId: 'A', categoryId: 'cat1', lineSubtotal: 600 },
  { productId: 'B', categoryId: 'cat1', lineSubtotal: 400 },
  { productId: 'D', categoryId: 'cat2', lineSubtotal: 1000 },
];

// --- computeEligibleLines (Part 12/13/29) ---

test('computeEligibleLines: no restriction -> every line eligible', () => {
  const { eligibleLines, eligibleSubtotal } = computeEligibleLines(baseRules, lines);
  assert.equal(eligibleLines.length, 3);
  assert.equal(eligibleSubtotal, 2000);
});

test('computeEligibleLines: product restriction excludes unrestricted products (Part 12)', () => {
  const rules: CouponRules = { ...baseRules, applicableProductIds: ['A', 'B'] };
  const { eligibleLines, eligibleSubtotal } = computeEligibleLines(rules, lines);
  assert.deepEqual(eligibleLines.map((l) => l.productId), ['A', 'B']);
  assert.equal(eligibleSubtotal, 1000);
});

test('computeEligibleLines: category restriction excludes other categories (Part 13)', () => {
  const rules: CouponRules = { ...baseRules, applicableCategoryIds: ['cat1'] };
  const { eligibleLines, eligibleSubtotal } = computeEligibleLines(rules, lines);
  assert.deepEqual(eligibleLines.map((l) => l.productId), ['A', 'B']);
  assert.equal(eligibleSubtotal, 1000);
});

test('computeEligibleLines: product and category restrictions are OR-ed', () => {
  const rules: CouponRules = { ...baseRules, applicableProductIds: ['D'], applicableCategoryIds: ['cat1'] };
  const { eligibleLines } = computeEligibleLines(rules, lines);
  assert.deepEqual(
    eligibleLines.map((l) => l.productId).sort(),
    ['A', 'B', 'D'],
  );
});

test('computeEligibleLines: exclusion takes precedence over a category match (Part 29)', () => {
  const rules: CouponRules = { ...baseRules, applicableCategoryIds: ['cat1'], excludedProductIds: ['B'] };
  const { eligibleLines } = computeEligibleLines(rules, lines);
  assert.deepEqual(eligibleLines.map((l) => l.productId), ['A']);
});

test('computeEligibleLines: nothing eligible -> empty result, not an error (caller decides how to handle)', () => {
  const rules: CouponRules = { ...baseRules, applicableProductIds: ['Z'] };
  const { eligibleLines, eligibleSubtotal } = computeEligibleLines(rules, lines);
  assert.equal(eligibleLines.length, 0);
  assert.equal(eligibleSubtotal, 0);
});

// --- calculateCouponDiscount (Part 3/5/30) ---

test('calculateCouponDiscount: flat discount, fully eligible cart', () => {
  const rules: CouponRules = { ...baseRules, type: 'flat', value: 200 };
  const { eligibleLines, eligibleSubtotal } = computeEligibleLines(rules, lines);
  const result = calculateCouponDiscount(rules, { eligibleLines, eligibleSubtotal });
  assert.equal(result.discountAmount, 200);
});

test('calculateCouponDiscount: percentage discount computed against ELIGIBLE subtotal only, not the whole cart (the core bug fix)', () => {
  const rules: CouponRules = { ...baseRules, type: 'percentage', value: 10, applicableProductIds: ['A', 'B'] };
  const eligibility = computeEligibleLines(rules, lines);
  const result = calculateCouponDiscount(rules, eligibility);
  // 10% of (600+400)=1000 eligible, NOT 10% of the full 2000 cart.
  assert.equal(result.discountAmount, 100);
});

test('calculateCouponDiscount: maxDiscountAmount caps a percentage discount (Part 5)', () => {
  const rules: CouponRules = { ...baseRules, type: 'percentage', value: 10, maxDiscountAmount: 50 };
  const eligibility = computeEligibleLines(rules, lines); // eligibleSubtotal = 2000, 10% = 200
  const result = calculateCouponDiscount(rules, eligibility);
  assert.equal(result.discountAmount, 50);
});

test('calculateCouponDiscount: a flat discount never exceeds the eligible subtotal (Part 5)', () => {
  const rules: CouponRules = { ...baseRules, type: 'flat', value: 99999 };
  const eligibility = computeEligibleLines(rules, lines);
  const result = calculateCouponDiscount(rules, eligibility);
  assert.equal(result.discountAmount, 2000);
});

test('calculateCouponDiscount: discount is never negative', () => {
  const rules: CouponRules = { ...baseRules, type: 'flat', value: 0 };
  const eligibility = computeEligibleLines(rules, lines);
  const result = calculateCouponDiscount(rules, eligibility);
  assert.ok(result.discountAmount >= 0);
});

test('calculateCouponDiscount: allocation sums EXACTLY to discountAmount despite rounding (Part 30)', () => {
  const rules: CouponRules = { ...baseRules, type: 'percentage', value: 33.333 };
  const threeLines = [
    { productId: 'X', categoryId: 'c', lineSubtotal: 333.33 },
    { productId: 'Y', categoryId: 'c', lineSubtotal: 333.33 },
    { productId: 'Z', categoryId: 'c', lineSubtotal: 333.34 },
  ];
  const eligibility = computeEligibleLines(rules, threeLines);
  const result = calculateCouponDiscount(rules, eligibility);
  const allocatedSum = result.allocation.reduce((s, a) => s + a.amount, 0);
  assert.equal(Math.round(allocatedSum * 100) / 100, result.discountAmount);
});

test('calculateCouponDiscount: allocation is deterministic (same input -> same output every time)', () => {
  const rules: CouponRules = { ...baseRules, type: 'flat', value: 250 };
  const eligibility = computeEligibleLines(rules, lines);
  const a = calculateCouponDiscount(rules, eligibility);
  const b = calculateCouponDiscount(rules, eligibility);
  assert.deepEqual(a, b);
});

test('calculateCouponDiscount: no eligible lines -> zero discount, empty allocation', () => {
  const rules: CouponRules = { ...baseRules, applicableProductIds: ['nonexistent'] };
  const eligibility = computeEligibleLines(rules, lines);
  const result = calculateCouponDiscount(rules, eligibility);
  assert.equal(result.discountAmount, 0);
  assert.deepEqual(result.allocation, []);
});

test('calculateCouponDiscount: allocation is proportional to each eligible line share', () => {
  const rules: CouponRules = { ...baseRules, type: 'flat', value: 100 };
  const twoLines = [
    { productId: 'A', categoryId: 'c', lineSubtotal: 750 },
    { productId: 'B', categoryId: 'c', lineSubtotal: 250 },
  ];
  const eligibility = computeEligibleLines(rules, twoLines);
  const result = calculateCouponDiscount(rules, eligibility);
  const aShare = result.allocation.find((a) => a.productId === 'A')!.amount;
  const bShare = result.allocation.find((a) => a.productId === 'B')!.amount;
  assert.equal(aShare, 75);
  assert.equal(bShare, 25);
});
