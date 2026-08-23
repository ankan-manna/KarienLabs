/**
 * Part 21/22/24/25 — the refund calculation layer. Deliberately
 * NOT a rebuild of the pricing/tax engine (s 4/13): every number this
 * function touches (unitPrice, gstRate, item.amount, order.totals.discount)
 * is read verbatim from the already-frozen Order document — nothing here
 * ever recomputes GST from a current tax config or re-prices a product.
 *
 * Coupon/discount allocation ( 19 Part 30/34/35): orders created
 * since store an EXACT per-item `couponDiscountAmount` (computed
 * once at checkout, eligibility-aware — see coupon-discount-calculation.util.ts
 * — never re-derived from the live coupon document). When present, this
 * function uses that value directly, scaled to the returned quantity
 * fraction. For orders created BEFORE (no stored allocation),
 * this falls back to the original estimate: each item's share of the
 * order-level `totals.discount` proportional to that item's share of the
 * order's total GST-inclusive gross (`amount`) — preserved for backward
 * compatibility so historical orders keep computing exactly as they always
 * have (Part 36).
 */

export interface RefundableOrderItem {
  orderItemId: string;
  quantity: number; // originally ordered quantity for this line
  unitPrice: number; // frozen, GST-exclusive
  gstRate: number;
  amount: number; // frozen GST-inclusive gross for the FULL line (quantity units), pre-discount
  /** this line's exact coupon-discount share for the FULL originally-ordered quantity, when the order was created after this field existed. */
  couponDiscountAmount?: number;
}

export interface ReturnItemRequest {
  orderItemId: string;
  quantity: number; // quantity being refunded in THIS return
}

export interface RefundCalculationInput {
  /** Every item on the original order (needed to compute each item's fair share of the order-level discount). */
  orderItems: RefundableOrderItem[];
  orderDiscount: number;
  /** Part 23 — shipping is excluded from the refundable amount unless explicitly included by the caller (business-configuration-driven, see return.service.ts). */
  includeShippingAmount?: number;
  /** The specific items/quantities this return covers. */
  returnItems: ReturnItemRequest[];
  /** Part 22 — running totals so a partial refund never exceeds what was actually paid or what's still refundable. */
  paidAmount: number;
  alreadyRefundedAmount: number;
}

export interface RefundItemBreakdown {
  orderItemId: string;
  quantity: number;
  grossAmount: number;
  discountShare: number;
  netRefund: number;
}

export interface RefundCalculationResult {
  /** The amount actually refundable for this request, after capping against paidAmount - alreadyRefundedAmount. */
  refundableAmount: number;
  /** The uncapped, arithmetically "fair" amount before the paid/already-refunded cap was applied — surfaced for admin visibility, never used as the actual refund. */
  rawEligibleAmount: number;
  breakdown: RefundItemBreakdown[];
  cappedByRemainingRefundable: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateReturnRefundAmount(input: RefundCalculationInput): RefundCalculationResult {
  const orderItemMap = new Map(input.orderItems.map((i) => [i.orderItemId, i]));
  const totalGrossAllItems = input.orderItems.reduce((sum, i) => sum + i.amount, 0);

  const breakdown: RefundItemBreakdown[] = [];
  let rawEligibleAmount = 0;

  for (const req of input.returnItems) {
    const orderItem = orderItemMap.get(req.orderItemId);
    if (!orderItem || orderItem.quantity <= 0) continue;

    // Gross (GST-inclusive) value of just the returned quantity, derived
    // from the line's own per-unit-equivalent share of its frozen `amount`
    // — not unitPrice*qty*(1+gstRate/100) recomputed independently, so any
    // line-level rounding already baked into `amount` at checkout carries
    // through consistently rather than drifting.
    const perUnitGross = orderItem.amount / orderItem.quantity;
    const grossAmount = round2(perUnitGross * req.quantity);

    // This item's share of the discount, scaled to just the returned
    // quantity (Part 24). Prefers the exact stored per-item allocation
    // (Part 30/34/35); falls back to the pre--19 proportional
    // estimate for orders that predate it (Part 36).
    const discountShare =
      orderItem.couponDiscountAmount != null
        ? round2((orderItem.couponDiscountAmount / orderItem.quantity) * req.quantity)
        : totalGrossAllItems > 0
          ? round2((grossAmount / totalGrossAllItems) * input.orderDiscount)
          : 0;

    const netRefund = round2(Math.max(0, grossAmount - discountShare));
    rawEligibleAmount += netRefund;
    breakdown.push({ orderItemId: req.orderItemId, quantity: req.quantity, grossAmount, discountShare, netRefund });
  }

  rawEligibleAmount = round2(rawEligibleAmount + (input.includeShippingAmount ?? 0));

  const remainingRefundable = round2(Math.max(0, input.paidAmount - input.alreadyRefundedAmount));
  const refundableAmount = round2(Math.min(rawEligibleAmount, remainingRefundable));

  return {
    refundableAmount,
    rawEligibleAmount,
    breakdown,
    cappedByRemainingRefundable: refundableAmount < rawEligibleAmount,
  };
}
