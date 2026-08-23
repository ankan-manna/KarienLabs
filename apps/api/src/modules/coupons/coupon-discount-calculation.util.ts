import { COUPON_TYPES, type CouponType } from '@medcommerce/shared';

/**
 * Part 12/13/29/30 — pure, DB-free eligibility + discount-allocation
 * math, split out from coupon-validation.service.ts (which needs Mongo for
 * existence/date/usage-limit checks) so this — the actual pricing-engine
 * component — is unit-testable without mocking Mongoose, mirroring the
 * established pure/impure split (return-refund-calculation.util.ts,
 * prescription-config.util.ts).
 *
 * FIXES a real bug in the pre-existing coupon system: `validateCouponForCart`
 * used to compute a product/category-restricted coupon's discount against the
 * WHOLE cart subtotal, not just the eligible items' subtotal — so a coupon
 * scoped to Product A/B/C would still discount an ineligible Product D in the
 * same cart. This module computes eligibility and discount against ONLY the
 * eligible line items, and produces a deterministic per-line allocation
 * (Part 30) that is later stored on the order (never re-derived from the
 * live coupon document for historical orders — Part 31/34/35).
 */

export interface CouponRules {
  type: CouponType;
  value: number;
  maxDiscountAmount: number | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  /** Part 29 — takes precedence over any product/category match. */
  excludedProductIds: string[];
}

export interface CartLine {
  productId: string;
  categoryId: string;
  /** GST-exclusive subtotal for this line (unitPrice * quantity). */
  lineSubtotal: number;
}

export interface EligibleLinesResult {
  eligibleLines: CartLine[];
  eligibleSubtotal: number;
}

export interface DiscountAllocationResult {
  discountAmount: number;
  allocation: { productId: string; amount: number }[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Part 12/13/29 — a line is eligible when: not explicitly excluded, AND
 * (the coupon has no product/category restriction at all, OR the line
 * matches the product restriction, OR the line matches the category
 * restriction). Product and category restrictions are OR'd together (a
 * coupon can be scoped by either/both) — an empty restriction list means
 * "no restriction on that dimension," not "nothing matches."
 */
export function computeEligibleLines(coupon: CouponRules, lines: CartLine[]): EligibleLinesResult {
  const excluded = new Set(coupon.excludedProductIds);
  const hasProductRestriction = coupon.applicableProductIds.length > 0;
  const hasCategoryRestriction = coupon.applicableCategoryIds.length > 0;
  const productSet = new Set(coupon.applicableProductIds);
  const categorySet = new Set(coupon.applicableCategoryIds);

  const eligibleLines = lines.filter((line) => {
    if (excluded.has(line.productId)) return false;
    if (!hasProductRestriction && !hasCategoryRestriction) return true;
    return (hasProductRestriction && productSet.has(line.productId)) ||
      (hasCategoryRestriction && categorySet.has(line.categoryId));
  });

  const eligibleSubtotal = round2(eligibleLines.reduce((sum, l) => sum + l.lineSubtotal, 0));
  return { eligibleLines, eligibleSubtotal };
}

/**
 * Part 3/5/30 — discount is calculated against the ELIGIBLE subtotal only
 * (never the whole cart, never negative, never more than what's eligible),
 * then allocated deterministically across eligible lines proportional to
 * each line's share of the eligible subtotal. The rounding remainder is
 * assigned to the LAST eligible line (stable, deterministic ordering — not
 * "largest line," which would depend on a secondary sort) so allocated
 * amounts always sum EXACTLY to `discountAmount`, which matters for
 * refund/return math downstream (Part 34/35).
 */
export function calculateCouponDiscount(
  coupon: CouponRules,
  eligibility: EligibleLinesResult,
): DiscountAllocationResult {
  const { eligibleLines, eligibleSubtotal } = eligibility;
  if (eligibleLines.length === 0 || eligibleSubtotal <= 0) {
    return { discountAmount: 0, allocation: [] };
  }

  let discountAmount =
    coupon.type === COUPON_TYPES.FLAT ? coupon.value : (eligibleSubtotal * coupon.value) / 100;
  if (coupon.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
  discountAmount = Math.min(discountAmount, eligibleSubtotal);
  discountAmount = Math.max(0, round2(discountAmount));

  if (discountAmount === 0) return { discountAmount: 0, allocation: [] };

  let allocated = 0;
  const allocation = eligibleLines.map((line, idx) => {
    const isLast = idx === eligibleLines.length - 1;
    const share = isLast
      ? round2(discountAmount - allocated)
      : round2((line.lineSubtotal / eligibleSubtotal) * discountAmount);
    allocated = round2(allocated + share);
    return { productId: line.productId, amount: share };
  });

  return { discountAmount, allocation };
}
