import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeBundleAvailableUnits } from './bundle-availability.util';

test('computeBundleAvailableUnits: single component, qty 1 each — SKU1=10, SKU2=5 -> combo=5', () => {
  const units = computeBundleAvailableUnits([
    { availableQty: 10, requiredQty: 1 },
    { availableQty: 5, requiredQty: 1 },
  ]);
  assert.equal(units, 5);
});

test('computeBundleAvailableUnits: three components, qty 1 each — SKU1=10, SKU2=20, SKU3=7 -> combo=7', () => {
  const units = computeBundleAvailableUnits([
    { availableQty: 10, requiredQty: 1 },
    { availableQty: 20, requiredQty: 1 },
    { availableQty: 7, requiredQty: 1 },
  ]);
  assert.equal(units, 7);
});

test('computeBundleAvailableUnits: required quantities differ — SKU1=10/qty2, SKU2=20/qty1 -> combo=5', () => {
  const units = computeBundleAvailableUnits([
    { availableQty: 10, requiredQty: 2 },
    { availableQty: 20, requiredQty: 1 },
  ]);
  assert.equal(units, 5);
});

test('computeBundleAvailableUnits: a zero-stock component makes the whole combo unavailable', () => {
  const units = computeBundleAvailableUnits([
    { availableQty: 0, requiredQty: 1 },
    { availableQty: 20, requiredQty: 1 },
  ]);
  assert.equal(units, 0);
});

test('computeBundleAvailableUnits: component stock below required quantity floors to 0, not negative', () => {
  const units = computeBundleAvailableUnits([
    { availableQty: 1, requiredQty: 5 },
    { availableQty: 100, requiredQty: 1 },
  ]);
  assert.equal(units, 0);
});

test('computeBundleAvailableUnits: no components -> 0 (never Infinity/NaN)', () => {
  assert.equal(computeBundleAvailableUnits([]), 0);
});

test('computeBundleAvailableUnits: negative/invalid inputs are clamped, never produce a negative result', () => {
  const units = computeBundleAvailableUnits([{ availableQty: -5, requiredQty: -1 }]);
  assert.equal(units, 0);
});

test('computeBundleAvailableUnits: single component exactly divisible', () => {
  const units = computeBundleAvailableUnits([{ availableQty: 15, requiredQty: 3 }]);
  assert.equal(units, 5);
});
