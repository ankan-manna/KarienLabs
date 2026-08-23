/**
 * (CAT-04) batch MRP resolution:
 *
 *   Batch MRP exists (non-null)  -> use Batch MRP
 *   Batch MRP absent (null)      -> use Product MRP
 *
 * This is the catalog/pack MRP shown on an invoice line, NOT the customer's
 * charged selling price (that's `basePrice` minus whatever the Pricing/
 * Discount/Coupon engine applies — unrelated to this function). Centralized
 * here so the future Invoice/GST engine can call `resolveEffectiveBatchMrp`
 * instead of every call site re-deriving `batch.mrp ?? product.mrp` itself.
 */
export function resolveEffectiveBatchMrp(
  batch: { mrp?: number | null } | null | undefined,
  product: { mrp: number },
): number {
  return batch?.mrp ?? product.mrp;
}
