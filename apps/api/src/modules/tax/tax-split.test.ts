import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveGstTaxType, splitGst } from '@medcommerce/shared';

test('resolveGstTaxType: same state code -> intra_state', () => {
  assert.equal(resolveGstTaxType('19', '19'), 'intra_state'); // West Bengal / West Bengal
});

test('resolveGstTaxType: different state codes -> inter_state', () => {
  assert.equal(resolveGstTaxType('19', '21'), 'inter_state'); // West Bengal / Odisha
});

test('resolveGstTaxType: either code missing -> unknown', () => {
  assert.equal(resolveGstTaxType(null, '21'), 'unknown');
  assert.equal(resolveGstTaxType('19', null), 'unknown');
  assert.equal(resolveGstTaxType(undefined, undefined), 'unknown');
});

test('splitGst intra-state: CGST+SGST split the total rate evenly, IGST is zero', () => {
  // Warehouse West Bengal, customer West Bengal, 18% GST on a taxable value of 1000.
  const result = splitGst(1000, 18, 'intra_state');
  assert.equal(result.cgstRate, 9);
  assert.equal(result.cgstAmount, 90);
  assert.equal(result.sgstRate, 9);
  assert.equal(result.sgstAmount, 90);
  assert.equal(result.igstRate, 0);
  assert.equal(result.igstAmount, 0);
  // Total tax collected reconciles exactly regardless of jurisdiction.
  assert.equal(result.cgstAmount + result.sgstAmount, 180);
});

test('splitGst inter-state: IGST equals the full rate, CGST/SGST are zero', () => {
  // Warehouse West Bengal, customer Odisha, 18% GST on a taxable value of 1000.
  const result = splitGst(1000, 18, 'inter_state');
  assert.equal(result.cgstRate, 0);
  assert.equal(result.cgstAmount, 0);
  assert.equal(result.sgstRate, 0);
  assert.equal(result.sgstAmount, 0);
  assert.equal(result.igstRate, 18);
  assert.equal(result.igstAmount, 180);
});

test('splitGst unknown jurisdiction conservatively takes the same IGST-branch numbers inter-state would (only `taxType` differs, for downstream data-quality flagging)', () => {
  const known = splitGst(1000, 18, 'inter_state');
  const unknown = splitGst(1000, 18, 'unknown');
  assert.equal(unknown.taxType, 'unknown');
  assert.equal(known.taxType, 'inter_state');
  assert.equal(unknown.igstAmount, known.igstAmount);
  assert.equal(unknown.igstRate, known.igstRate);
  assert.equal(unknown.cgstAmount, known.cgstAmount);
  assert.equal(unknown.sgstAmount, known.sgstAmount);
});

test('splitGst never hardcodes a 50/50 split independent of the actual rate — different GST rates split proportionally', () => {
  const at5 = splitGst(1000, 5, 'intra_state');
  assert.equal(at5.cgstRate, 2.5);
  assert.equal(at5.cgstAmount, 25);
  assert.equal(at5.sgstAmount, 25);

  const at28 = splitGst(1000, 28, 'intra_state');
  assert.equal(at28.cgstRate, 14);
  assert.equal(at28.cgstAmount, 140);
  assert.equal(at28.sgstAmount, 140);
});

test('splitGst: CGST + SGST always reconciles exactly to the total tax even when the rate does not halve evenly', () => {
  // 12.5% is an edge case some real HSNs actually use (e.g. certain cess combinations).
  const result = splitGst(333.33, 12.5, 'intra_state');
  const totalTax = Math.round(333.33 * 0.125 * 100) / 100;
  assert.equal(Math.round((result.cgstAmount + result.sgstAmount) * 100) / 100, totalTax);
});

test('splitGst: zero GST rate produces zero tax on both branches', () => {
  assert.deepEqual(splitGst(500, 0, 'intra_state'), {
    taxType: 'intra_state',
    cgstRate: 0,
    cgstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    igstRate: 0,
    igstAmount: 0,
  });
  assert.deepEqual(splitGst(500, 0, 'inter_state'), {
    taxType: 'inter_state',
    cgstRate: 0,
    cgstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    igstRate: 0,
    igstAmount: 0,
  });
});
