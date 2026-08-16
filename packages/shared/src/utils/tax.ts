/**
 * Prompt 13 (TAX-01) — pure, deterministic GST split math. Kept side-effect
 * free (no DB access) so it's trivially unit-testable and reusable from both
 * the backend tax-calculation service and, if useful later, an admin preview
 * UI — mirrors the resolveProductDefaults/resolveEffectiveBatchMrp pattern
 * from Prompt 12.
 */

export type GstTaxType = 'intra_state' | 'inter_state' | 'unknown';

export interface GstSplit {
  taxType: GstTaxType;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Warehouse State == Customer Shipping State -> intra-state (CGST+SGST).
 * Warehouse State != Customer Shipping State -> inter-state (IGST).
 * Either state code unresolvable -> 'unknown' (see splitGst's doc comment
 * for why callers should treat this the same as inter-state).
 */
export function resolveGstTaxType(
  warehouseStateCode: string | null | undefined,
  customerStateCode: string | null | undefined,
): GstTaxType {
  if (!warehouseStateCode || !customerStateCode) return 'unknown';
  return warehouseStateCode === customerStateCode ? 'intra_state' : 'inter_state';
}

/**
 * Splits `gstRate`% of `taxableAmount` into CGST+SGST (intra-state) or IGST
 * (inter-state/unknown). The total tax COLLECTED is identical either way —
 * only which tax head it's attributed to differs — so 'unknown' jurisdiction
 * (e.g. a customer's free-text address state didn't match the GST state-code
 * table) conservatively defaults to IGST rather than guessing intra-state;
 * this never under- or over-charges the customer, it only affects which GST
 * return line the amount would appear under, which is exactly the kind of
 * data-quality issue that should surface as "IGST charged, verify state" on
 * the invoice/admin UI rather than silently guessing same-state.
 *
 * SGST is derived as `totalTax - cgstAmount` (not independently rounded) so
 * CGST+SGST always reconciles exactly to the total tax for the line, even
 * when `gstRate / 2` doesn't divide evenly into whole paise.
 */
export function splitGst(taxableAmount: number, gstRate: number, taxType: GstTaxType): GstSplit {
  if (taxType === 'intra_state') {
    const halfRate = gstRate / 2;
    const totalTax = round2((taxableAmount * gstRate) / 100);
    const cgstAmount = round2((taxableAmount * halfRate) / 100);
    const sgstAmount = round2(totalTax - cgstAmount);
    return {
      taxType,
      cgstRate: halfRate,
      cgstAmount,
      sgstRate: halfRate,
      sgstAmount,
      igstRate: 0,
      igstAmount: 0,
    };
  }

  const igstAmount = round2((taxableAmount * gstRate) / 100);
  return { taxType, cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: gstRate, igstAmount };
}
