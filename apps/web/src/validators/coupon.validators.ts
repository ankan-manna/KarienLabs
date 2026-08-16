import { z } from 'zod';

/** Empty string → undefined before coercion, so an untouched optional number field doesn't coerce to 0 and then fail a `.min(1)`-style check silently. */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === undefined || v === null ? undefined : v), schema.optional());

export const couponFormSchema = z
  .object({
    code: z.string().trim().min(3, 'Too short').max(40),
    description: z.string().optional(),
    type: z.enum(['flat', 'percentage']),
    value: z.coerce.number().min(0),
    maxDiscountAmount: optionalNumber(z.coerce.number().min(0)),
    minCartValue: optionalNumber(z.coerce.number().min(0)),
    usageLimitGlobal: optionalNumber(z.coerce.number().int().min(1)),
    usageLimitPerUser: optionalNumber(z.coerce.number().int().min(1)),
    firstOrderOnly: z.boolean().optional(),
    priority: optionalNumber(z.coerce.number().int().min(0)),
    validFrom: z.string().min(1, 'Required'),
    validTo: z.string().min(1, 'Required'),
    isActive: z.boolean().optional(),
    sellerId: z.string().nullable().optional(),
    applicableProductIds: z.array(z.string()).optional(),
    applicableCategoryIds: z.array(z.string()).optional(),
    applicableUserIds: z.array(z.string()).optional(),
    excludedProductIds: z.array(z.string()).optional(),
  })
  // Part 39 — mirrors the server-side check (coupon.validator.ts) so the
  // admin form fails fast instead of round-tripping to the API first.
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Cannot exceed 100%' });
    }
    if (data.validFrom && data.validTo && new Date(data.validTo).getTime() <= new Date(data.validFrom).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'Must be after the start date' });
    }
  });

export type CouponFormValues = z.infer<typeof couponFormSchema>;
