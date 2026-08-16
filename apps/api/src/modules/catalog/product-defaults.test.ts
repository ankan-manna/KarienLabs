import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveProductDefaults } from '@medcommerce/shared';

test('resolveProductDefaults: explicit product.expirable overrides category default', () => {
  const category = { isExpirableDefault: true, requiresPrescriptionDefault: false };
  assert.equal(resolveProductDefaults({ expirable: false }, category).isExpirable, false);
  assert.equal(resolveProductDefaults({ expirable: true }, category).isExpirable, true);
});

test('resolveProductDefaults: unset (null) product.expirable falls back to category default', () => {
  assert.equal(
    resolveProductDefaults({ expirable: null }, { isExpirableDefault: true }).isExpirable,
    true,
  );
  assert.equal(
    resolveProductDefaults({ expirable: undefined }, { isExpirableDefault: false }).isExpirable,
    false,
  );
});

test('resolveProductDefaults: does not confuse an explicit false with unset', () => {
  // The exact scenario the spec calls out: Product B explicitly sets
  // expirable = false against a category default of true -> resolved false,
  // never silently reverting to the category's true.
  const resolved = resolveProductDefaults(
    { expirable: false },
    { isExpirableDefault: true },
  );
  assert.equal(resolved.isExpirable, false);
});

test('resolveProductDefaults: prescriptionRequired follows the same product-overrides-category rule', () => {
  const category = { requiresPrescriptionDefault: true };
  assert.equal(
    resolveProductDefaults({ medicine: { prescriptionRequired: null } }, category)
      .requiresPrescription,
    true,
  );
  assert.equal(
    resolveProductDefaults({ medicine: { prescriptionRequired: false } }, category)
      .requiresPrescription,
    false,
  );
  assert.equal(
    resolveProductDefaults({ medicine: undefined }, category).requiresPrescription,
    true,
  );
});

test('resolveProductDefaults: missing category falls back to hard-coded defaults (true/false)', () => {
  const resolved = resolveProductDefaults({ expirable: null, medicine: null }, null);
  assert.equal(resolved.isExpirable, true);
  assert.equal(resolved.requiresPrescription, false);
});
