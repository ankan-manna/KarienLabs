import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Prompt 19 Part 16/42 — a dedicated, tiny counter collection purely for
 * ATOMIC per-user usage-limit enforcement. `CouponUsageModel` (the
 * append-only audit trail) can't safely gate concurrency on its own: two
 * concurrent transactions both reading `countDocuments({couponId,userId})`
 * before either has committed its `create()` will both see the same
 * pre-increment count and both pass a `< usageLimitPerUser` check — inserting
 * two DIFFERENT new documents never conflicts, so nothing forces
 * serialization. This collection's UNIQUE index on `{couponId,userId}` does:
 * two concurrent `findOneAndUpdate({...}, {$inc:{count:1}}, {upsert:true})`
 * calls for the SAME (couponId,userId) pair are forced through MongoDB's
 * document-level write-conflict detection inside a transaction, so only one
 * can win the race — see recordCouponUsage in coupon-validation.service.ts.
 */
const couponUserUsageCounterSchema = new Schema({
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  count: { type: Number, default: 0 },
});

couponUserUsageCounterSchema.index({ couponId: 1, userId: 1 }, { unique: true });

export type CouponUserUsageCounterDocument = InferSchemaType<typeof couponUserUsageCounterSchema>;
export const CouponUserUsageCounterModel = model(
  'CouponUserUsageCounter',
  couponUserUsageCounterSchema,
);
