import { REVIEW_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * One review per (productId, userId) — enforced by the unique index below.
 * `isVerifiedPurchase` is computed at creation time from the customer's order
 * history and displayed as a badge; it does not gate whether a review can be
 * submitted (see review.service.ts) since requiring a delivered order would be
 * too restrictive for a first-pass implementation.
 */
const reviewSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, default: '', trim: true, maxlength: 120 },
  comment: { type: String, required: true, trim: true, maxlength: 2000 },
  isVerifiedPurchase: { type: Boolean, default: false },
  status: {
    type: String,
    enum: Object.values(REVIEW_STATUS),
    default: REVIEW_STATUS.PUBLISHED,
    index: true,
  },
});

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

auditPlugin(reviewSchema);

export type ReviewDocument = InferSchemaType<typeof reviewSchema>;
export const ReviewModel = model('Review', reviewSchema);
