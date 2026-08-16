/**
 * Combo/Bundle stock formula (business requirement — see bundle.service.ts's
 * `resolveProductAvailability`): a bundle/combo SKU carries NO batches of its
 * own — its sellable quantity is DERIVED from its component products'
 * available stock, never a manually-editable field:
 *
 *   availableComboUnits = MIN over components of floor(componentAvailableQty / requiredQtyPerCombo)
 *
 * Pure math, no DB access, so it's unit-testable in isolation — mirrors the
 * existing `batch-pricing.util.ts` pattern (small pure `.util.ts` + matching
 * `.util.test.ts`, no mocking required).
 */
export interface ComponentAvailability {
  /** Current authoritative available quantity of this component product (never negative). */
  availableQty: number;
  /** How many units of this component one combo unit consumes. */
  requiredQty: number;
}

export function computeBundleAvailableUnits(components: ComponentAvailability[]): number {
  if (components.length === 0) return 0;

  let minUnits = Infinity;
  for (const component of components) {
    const requiredQty = Math.max(1, component.requiredQty);
    const availableQty = Math.max(0, component.availableQty);
    const units = Math.floor(availableQty / requiredQty);
    if (units < minUnits) minUnits = units;
  }
  return Math.max(0, minUnits);
}
