/**
 * Prompt 12 (CAT-06) inheritance rule for the two tri-state product fields
 * (`expirable`, `medicine.prescriptionRequired`):
 *
 *   Product value explicitly set (true or false) -> use Product value
 *   Product value unset (null/undefined)          -> use Category default
 *
 * Implemented with `??` (nullish coalescing), which is the one operator that
 * treats `null`/`undefined` as "absent" while still preserving an explicit
 * `false` — a plain `||` fallback would be wrong here (it would treat a
 * deliberate `false` the same as "unset" and incorrectly fall through to the
 * category default). This is the exact "do not confuse false with unset"
 * distinction the spec calls out.
 *
 * Lives in the shared package (not apps/api only) so the admin product form
 * can show the same "Effective: YES/NO" resolution the backend computes at
 * checkout/invoice time, without reimplementing the rule twice.
 */

export interface ProductDefaultsInput {
  expirable?: boolean | null;
  medicine?: { prescriptionRequired?: boolean | null } | null;
}

export interface CategoryDefaultsInput {
  isExpirableDefault?: boolean | null;
  requiresPrescriptionDefault?: boolean | null;
}

export interface ResolvedProductDefaults {
  isExpirable: boolean;
  requiresPrescription: boolean;
}

/**
 * `category` may be null/omitted (e.g. the product's category was deleted, or
 * the caller only has a partial projection) — falls back to the same
 * hard-coded defaults the Category schema itself uses (true/false), so
 * resolution never throws and never silently returns `undefined`.
 */
export function resolveProductDefaults(
  product: ProductDefaultsInput,
  category?: CategoryDefaultsInput | null,
): ResolvedProductDefaults {
  return {
    isExpirable: product.expirable ?? category?.isExpirableDefault ?? true,
    requiresPrescription:
      product.medicine?.prescriptionRequired ?? category?.requiresPrescriptionDefault ?? false,
  };
}
