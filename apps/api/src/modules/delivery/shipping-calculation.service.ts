import { ShippingRuleModel } from './models/shipping-rule.model';
import { ShippingZoneModel } from './models/shipping-zone.model';

export type DeliveryType = 'standard' | 'express';

interface ShippingChargeInput {
  subtotal: number;
  state: string;
  pincode: string;
  deliveryType?: DeliveryType;
  totalWeightGrams?: number;
}

/**
 * Resolves the shipping charge for a cart against admin-configured ShippingZone +
 * ShippingRule records. Was previously hardcoded to 0 at checkout (see the removed
 * comment in order.service.ts) — this is the actual engine that was missing.
 *
 * Resolution order:
 *  1. Find zones matching the delivery pincode/state (falls back to a catch-all
 *     zone with no pincodes/states configured, so a store with a single flat rule
 *     doesn't need to define per-state zones).
 *  2. Within matching zones, find rules whose cart-value range covers the subtotal
 *     and whose weight range (if configured) covers the parcel weight.
 *  3. Prefer a rule matching the requested delivery type; fall back to a
 *     type-agnostic rule (deliveryType undefined) for backward compatibility with
 *     rules created before this field existed.
 *  4. Apply the winning rule's freeShippingThreshold if the subtotal clears it.
 *  5. No matching rule at all => 0 (unconfigured store still checks out cleanly).
 */
export async function calculateShippingCharge(input: ShippingChargeInput): Promise<number> {
  const zones = await ShippingZoneModel.find({
    isActive: true,
    $or: [
      { pincodes: input.pincode },
      { states: input.state },
      { $and: [{ pincodes: { $size: 0 } }, { states: { $size: 0 } }] },
    ],
  })
    .select('_id pincodes states')
    .lean();
  if (zones.length === 0) return 0;

  // Specific (pincode/state) matches outrank the catch-all zone.
  const specificZoneIds = zones
    .filter((z) => z.pincodes.includes(input.pincode) || z.states.includes(input.state))
    .map((z) => z._id);
  const zoneIds = specificZoneIds.length > 0 ? specificZoneIds : zones.map((z) => z._id);

  const rules = await ShippingRuleModel.find({
    isActive: true,
    zoneId: { $in: zoneIds },
    minCartValue: { $lte: input.subtotal },
    $or: [{ maxCartValue: null }, { maxCartValue: { $gte: input.subtotal } }],
    ...(input.totalWeightGrams != null
      ? {
          $and: [
            { $or: [{ minWeightGrams: null }, { minWeightGrams: { $lte: input.totalWeightGrams } }] },
            { $or: [{ maxWeightGrams: null }, { maxWeightGrams: { $gte: input.totalWeightGrams } }] },
          ],
        }
      : {}),
  })
    .sort({ minCartValue: -1 })
    .lean();
  if (rules.length === 0) return 0;

  const typed = input.deliveryType
    ? rules.find((r) => r.deliveryType === input.deliveryType)
    : undefined;
  const rule = typed ?? rules.find((r) => !r.deliveryType) ?? rules[0];

  if (rule.freeShippingThreshold != null && input.subtotal >= rule.freeShippingThreshold) {
    return 0;
  }
  return rule.charge;
}
