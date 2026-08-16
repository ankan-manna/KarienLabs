import { ORDER_STATUS, REVIEW_STATUS } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { ProductModel } from '../catalog/models/product.model';
import { OrderModel } from '../orders/models/order.model';

import { ReviewModel } from './models/review.model';
import { reviewRepository } from './review.repository';

interface CreateReviewInput {
  productId: string;
  rating: number;
  title?: string;
  comment: string;
}

/** Recomputes `Product.ratingAvg`/`ratingCount` from published reviews — called after every create/update/delete so listing pages stay in sync without a per-request aggregation. */
async function syncProductRating(productId: string): Promise<void> {
  const productObjectId = new mongoose.Types.ObjectId(productId);
  const [agg] = await ReviewModel.aggregate([
    { $match: { productId: productObjectId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await ProductModel.updateOne(
    { _id: productId },
    { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.count ?? 0 },
  );
}

export async function createReview(input: CreateReviewInput, userId: string) {
  const existing = await reviewRepository.findByProductAndUser(input.productId, userId);
  if (existing) throw new ConflictError('You have already reviewed this product');

  const purchase = await OrderModel.findOne({
    customerId: userId,
    status: ORDER_STATUS.DELIVERED,
    'items.productId': input.productId,
  }).select('_id');

  const review = await reviewRepository.create({
    ...input,
    userId,
    orderId: purchase?._id ?? null,
    isVerifiedPurchase: !!purchase,
    createdBy: userId,
  });

  await syncProductRating(input.productId);
  return review;
}

export async function updateReview(
  id: string,
  input: { rating?: number; title?: string; comment?: string },
  userId: string,
) {
  const review = await ReviewModel.findOne({ _id: id, deletedAt: null });
  if (!review) throw new NotFoundError('Review');
  if (String(review.userId) !== userId) throw new ForbiddenError('You can only edit your own review');

  const updated = await reviewRepository.updateById(id, { ...input, updatedBy: userId });
  await syncProductRating(String(review.productId));
  return updated;
}

export async function deleteReview(id: string, userId: string, isAdmin: boolean) {
  const review = await ReviewModel.findOne({ _id: id, deletedAt: null });
  if (!review) throw new NotFoundError('Review');
  if (!isAdmin && String(review.userId) !== userId) {
    throw new ForbiddenError('You can only delete your own review');
  }

  await reviewRepository.softDeleteById(id, userId);
  await syncProductRating(String(review.productId));
}

/** Public — published reviews for a product's detail page. */
export function listProductReviews(productId: string, query: ListQuery) {
  return reviewRepository.paginate(
    { ...query.filter, productId, status: REVIEW_STATUS.PUBLISHED },
    { page: query.page, limit: query.limit, sort: query.sort ?? '-createdAt' },
  );
}

/** Public — rating distribution (how many 5-star, 4-star, ...) alongside the average, for the review-summary widget on the product page. */
export async function getProductRatingSummary(productId: string) {
  const productObjectId = new mongoose.Types.ObjectId(productId);
  const rows = await ReviewModel.aggregate([
    { $match: { productId: productObjectId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const row of rows) {
    distribution[row._id as number] = row.count;
    total += row.count;
    sum += row._id * row.count;
  }

  return {
    average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    count: total,
    distribution,
  };
}

export function listMyReviews(userId: string, query: ListQuery) {
  return reviewRepository.paginate(
    { ...query.filter, userId },
    { page: query.page, limit: query.limit, sort: query.sort ?? '-createdAt' },
  );
}

export async function getReviewById(id: string) {
  const review = await reviewRepository.findById(id);
  if (!review) throw new NotFoundError('Review');
  return review;
}

/** Public — highest-rated recent reviews across all products, for the homepage "Customer Reviews" testimonial strip. */
export function listRecentTopReviews(limit = 6) {
  return ReviewModel.find({ status: REVIEW_STATUS.PUBLISHED, deletedAt: null, rating: { $gte: 4 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name')
    .populate('productId', 'name slug')
    .lean();
}
