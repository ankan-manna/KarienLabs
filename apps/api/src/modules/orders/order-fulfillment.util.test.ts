import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aggregatePackageSpec } from './order-fulfillment.util';

test('aggregatePackageSpec sums weight x quantity across entries', () => {
  const result = aggregatePackageSpec([
    { productId: 'a', quantity: 2, weightGrams: 100 },
    { productId: 'b', quantity: 3, weightGrams: 50 },
  ]);
  assert.equal(result.weightGrams, 2 * 100 + 3 * 50);
});

test('aggregatePackageSpec never invents a packaging-weight add-on — total is exactly the sum of configured weights', () => {
  const result = aggregatePackageSpec([{ productId: 'a', quantity: 1, weightGrams: 250 }]);
  assert.equal(result.weightGrams, 250);
});

test('aggregatePackageSpec takes the MAX of each dimension axis across entries, not a sum or a single product', () => {
  const result = aggregatePackageSpec([
    { productId: 'a', quantity: 1, lengthMm: 100, widthMm: 50, heightMm: 20 },
    { productId: 'b', quantity: 1, lengthMm: 60, widthMm: 90, heightMm: 200 },
  ]);
  assert.deepEqual(result.dimensions, { lengthMm: 100, widthMm: 90, heightMm: 200 });
});

test('aggregatePackageSpec: coldStorageRequired is true if ANY entry requires cold storage', () => {
  const result = aggregatePackageSpec([
    { productId: 'a', quantity: 1, coldStorage: false },
    { productId: 'b', quantity: 1, coldStorage: true },
  ]);
  assert.equal(result.coldStorageRequired, true);
});

test('aggregatePackageSpec: coldStorageRequired stays false when nothing requires it', () => {
  const result = aggregatePackageSpec([{ productId: 'a', quantity: 1, coldStorage: false }]);
  assert.equal(result.coldStorageRequired, false);
});

test('aggregatePackageSpec surfaces products missing weight data rather than silently using a default', () => {
  const result = aggregatePackageSpec([
    { productId: 'a', quantity: 1, weightGrams: 100 },
    { productId: 'b', quantity: 1, weightGrams: null },
    { productId: 'c', quantity: 1 },
  ]);
  assert.equal(result.weightGrams, 100);
  assert.deepEqual(result.productsMissingWeight.sort(), ['b', 'c']);
});

test('aggregatePackageSpec: bundle components accumulate by their OWN quantity, not the parent line quantity', () => {
  // Mirrors how resolveOrderPackageSpec expands bundle components before calling this —
  // each component entry already carries its own true total quantity.
  const result = aggregatePackageSpec([
    { productId: 'component-a', quantity: 6, weightGrams: 10 }, // 3 bundles x 2 per bundle
  ]);
  assert.equal(result.weightGrams, 60);
});
