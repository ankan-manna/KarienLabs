import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateReturnRefundAmount, type RefundableOrderItem } from './return-refund-calculation.util';

const items: RefundableOrderItem[] = [
  // Product A: unitPrice 500, qty 1, gstRate 12% -> amount = 560
  { orderItemId: 'a', quantity: 1, unitPrice: 500, gstRate: 12, amount: 560 },
  // Product B: unitPrice 500, qty 1, gstRate 12% -> amount = 560
  { orderItemId: 'b', quantity: 1, unitPrice: 500, gstRate: 12, amount: 560 },
];

test('coupon discount is allocated proportionally, not ignored: returning ONE of two equal-value items refunds roughly half the discount-adjusted amount, not the full gross price', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 200, // ₹200 off a ₹1120 (560+560) order
    returnItems: [{ orderItemId: 'a', quantity: 1 }],
    paidAmount: 920, // 1120 - 200
    alreadyRefundedAmount: 0,
  });

  // Item A is exactly half the order's gross (560 / 1120), so it should
  // absorb exactly half the discount (₹100), leaving a ₹460 refund — NOT
  // the full ₹560 gross price the old (pre--16) calc would have used.
  assert.equal(result.breakdown[0].grossAmount, 560);
  assert.equal(result.breakdown[0].discountShare, 100);
  assert.equal(result.refundableAmount, 460);
});

test('partial refund: returning a subset of items only refunds that subset', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'a', quantity: 1 }],
    paidAmount: 1120,
    alreadyRefundedAmount: 0,
  });
  assert.equal(result.refundableAmount, 560);
});

test('never refunds more than what remains after subtracting already-refunded amounts', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'a', quantity: 1 }, { orderItemId: 'b', quantity: 1 }],
    paidAmount: 1120,
    alreadyRefundedAmount: 700, // a prior partial refund already took ₹700
  });
  // Raw eligible is 1120 (both items), but only 420 remains refundable.
  assert.equal(result.rawEligibleAmount, 1120);
  assert.equal(result.refundableAmount, 420);
  assert.equal(result.cappedByRemainingRefundable, true);
});

test('fully refunded order caps at zero, never negative', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'a', quantity: 1 }],
    paidAmount: 1120,
    alreadyRefundedAmount: 1120,
  });
  assert.equal(result.refundableAmount, 0);
});

test('shipping is excluded from the refund by default (not passed = not refunded)', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'a', quantity: 1 }],
    paidAmount: 1120,
    alreadyRefundedAmount: 0,
  });
  assert.equal(result.refundableAmount, 560); // no shipping component included
});

test('shipping IS included only when the caller explicitly opts in', () => {
  const result = calculateReturnRefundAmount({
    orderItems: items,
    orderDiscount: 0,
    includeShippingAmount: 50,
    returnItems: [{ orderItemId: 'a', quantity: 1 }],
    paidAmount: 1170,
    alreadyRefundedAmount: 0,
  });
  assert.equal(result.refundableAmount, 610);
});

test('GST is never recalculated, only read from the frozen per-line `amount` (already GST-inclusive)', () => {
  // A 28%-GST item alongside a 5%-GST item — if GST were being recomputed
  // from a "current" rate this would drift; it must exactly match the
  // pre-summed `amount` fields instead.
  const mixedItems: RefundableOrderItem[] = [
    { orderItemId: 'x', quantity: 2, unitPrice: 100, gstRate: 28, amount: 256 }, // 100*2*1.28
    { orderItemId: 'y', quantity: 1, unitPrice: 200, gstRate: 5, amount: 210 },
  ];
  const result = calculateReturnRefundAmount({
    orderItems: mixedItems,
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'x', quantity: 1 }], // return 1 of the 2 units
    paidAmount: 466,
    alreadyRefundedAmount: 0,
  });
  assert.equal(result.breakdown[0].grossAmount, 128); // 256 / 2 units * 1 returned
});

test('returning a quantity across a line with zero order-level discount refunds the exact gross, no distortion', () => {
  const result = calculateReturnRefundAmount({
    orderItems: [{ orderItemId: 'a', quantity: 3, unitPrice: 100, gstRate: 0, amount: 300 }],
    orderDiscount: 0,
    returnItems: [{ orderItemId: 'a', quantity: 2 }],
    paidAmount: 300,
    alreadyRefundedAmount: 0,
  });
  assert.equal(result.refundableAmount, 200);
});
