import { COUPON_TYPES } from '@medcommerce/shared';
import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

const couponShape = {
  code: z.string().trim().min(3).max(40),
  description: z.string().max(500).optional(),
  type: z.enum(Object.values(COUPON_TYPES) as [string, ...string[]]),
  value: z.number().min(0),
  maxDiscountAmount: z.number().min(0).nullable().optional(),
  minCartValue: z.number().min(0).optional(),
  applicableProductIds: z.array(objectIdSchema).optional(),
  applicableCategoryIds: z.array(objectIdSchema).optional(),
  applicableUserIds: z.array(objectIdSchema).optional(),
  // Part 29 — excluded products take precedence over any
  // product/category match.
  excludedProductIds: z.array(objectIdSchema).optional(),
   // Part 14 — null = platform-wide.
  sellerId: objectIdSchema.nullable().optional(),
  usageLimitGlobal: z.number().int().min(1).nullable().optional(),
  usageLimitPerUser: z.number().int().min(1).optional(),
   // Part 15.
  firstOrderOnly: z.boolean().optional(),
   // Part 28.
  priority: z.number().int().min(0).optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  isActive: z.boolean().optional(),
};

/**
 * Part 39 — the two invalid combinations the admin form must never be able
 * to submit: a percentage discount above 100%, and an end date at or before
 * the start date. Applied to both create (all cross-field data always
 * present) and update (a PARTIAL patch — the check only fires when BOTH
 * relevant fields happen to be present in that particular patch; a patch
 * that only changes `value` without `type` can't be cross-checked without
 * fetching the current document, which the validator layer deliberately
 * doesn't do — see coupon.service.ts's updateCoupon for the equivalent
 * DB-aware check on the FULL merged document).
 */
function withCrossFieldChecks<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    const d = data as { type?: string; value?: number; validFrom?: Date; validTo?: Date };
    if (d.type === COUPON_TYPES.PERCENTAGE && typeof d.value === 'number' && d.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'A percentage discount cannot exceed 100%',
      });
    }
    if (d.validFrom && d.validTo && new Date(d.validTo).getTime() <= new Date(d.validFrom).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validTo'],
        message: 'End date must be after the start date',
      });
    }
  });
}

export const createCouponSchema = withCrossFieldChecks(z.object(couponShape));
export const updateCouponSchema = withCrossFieldChecks(z.object(couponShape).partial());

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1),
});
