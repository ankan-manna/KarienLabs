import { COUPON_TYPES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Applicability rules embedded — coupon-specific and bounded, no need for a separate CouponRules collection. */
const couponSchema = new Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  description: { type: String, default: '' },
  type: { type: String, enum: Object.values(COUPON_TYPES), required: true },
  value: { type: Number, required: true, min: 0 },
  maxDiscountAmount: { type: Number, default: null },
  minCartValue: { type: Number, default: 0 },

  applicableProductIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  applicableCategoryIds: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
  applicableUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] }, // empty = all users
  // Part 29 — takes precedence over any product/category match;
  // lets a category-wide coupon carve out specific excluded products.
  excludedProductIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  // Part 14 — null = platform-wide (any/no seller). When set, only
  // applicable when the checkout's resolved seller matches (see
  // order.service.ts's resolveCheckoutSeller / coupon-validation.service.ts).
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },

  usageLimitGlobal: { type: Number, default: null },
  usageLimitPerUser: { type: Number, default: 1 },
  usageCount: { type: Number, default: 0 },

  // Part 15 — only applicable to a customer with no prior
  // qualifying order (see isFirstOrderEligible in coupon-validation.service.ts).
  firstOrderOnly: { type: Boolean, default: false },
  // Part 28 — deterministic ordering for the customer-facing
  // "available coupons" listing today; the documented, principled seam a
  // future multi-coupon stacking feature would use to decide application
  // order (this codebase's cart/order schema has exactly ONE coupon slot
  // today — see coupon-config.util.ts's doc comment on `firstOrderCouponEnabled`
  // — so priority has no *application-order* effect yet, only display order).
  priority: { type: Number, default: 0 },

  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  isActive: { type: Boolean, default: true, index: true },
});

couponSchema.index({ isActive: 1, validFrom: 1, validTo: 1 });

auditPlugin(couponSchema);

export type CouponDocument = InferSchemaType<typeof couponSchema>;
export const CouponModel = model('Coupon', couponSchema);
