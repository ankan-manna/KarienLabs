import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as reviewService from './review.service';

export const listProductReviewsHandler = asyncHandler(async (req, res) => {
  const result = await reviewService.listProductReviews(
    req.params.productId,
    req.query as unknown as ListQuery,
  );
  return sendPaginated(res, result.items, result.meta);
});

export const getProductRatingSummaryHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await reviewService.getProductRatingSummary(req.params.productId));
});

export const listRecentTopReviewsHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await reviewService.listRecentTopReviews());
});

export const listMyReviewsHandler = asyncHandler(async (req: Request, res) => {
  const result = await reviewService.listMyReviews(req.user!.id, req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const createReviewHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await reviewService.createReview(req.body, req.user!.id));
});

export const updateReviewHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await reviewService.updateReview(req.params.id, req.body, req.user!.id));
});

export const deleteReviewHandler = asyncHandler(async (req: Request, res) => {
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  await reviewService.deleteReview(req.params.id, req.user!.id, isAdmin);
  return sendSuccess(res, { deleted: true });
});
