import { Schema, model, type InferSchemaType } from 'mongoose';

/** Separate, unbounded, append-only — enforces per-user usage limits and gives an audit trail Coupon.usageCount alone can't. */
const couponUsageSchema = new Schema({
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  discountApplied: { type: Number, required: true, min: 0 },
  // Prompt 19 Part 30 — the same per-line breakdown stored on the order
  // itself (order.items[].couponDiscountAmount), duplicated here purely for
  // a self-contained usage-history/analytics record. The ORDER is still the
  // authoritative source refund/return calculations read from (Part 34/35).
  allocation: {
    type: [{ productId: Schema.Types.ObjectId, amount: Number }],
    default: [],
  },
  usedAt: { type: Date, default: Date.now },
});

couponUsageSchema.index({ couponId: 1, userId: 1 });
couponUsageSchema.index({ couponId: 1, orderId: 1 });

export type CouponUsageDocument = InferSchemaType<typeof couponUsageSchema>;
export const CouponUsageModel = model('CouponUsage', couponUsageSchema);
