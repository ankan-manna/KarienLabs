import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createReviewHandler,
  deleteReviewHandler,
  getProductRatingSummaryHandler,
  listMyReviewsHandler,
  listProductReviewsHandler,
  listRecentTopReviewsHandler,
  updateReviewHandler,
} from './review.controller';
import { createReviewSchema, updateReviewSchema } from './review.validator';

export const reviewRouter = Router();

// Public — anyone can read a product's reviews and rating summary, no auth required.
reviewRouter.get('/recent', listRecentTopReviewsHandler);
reviewRouter.get(
  '/product/:productId',
  validate(listQuerySchema, 'query'),
  listProductReviewsHandler,
);
reviewRouter.get('/product/:productId/summary', getProductRatingSummaryHandler);

// Authenticated — write your own reviews.
reviewRouter.get('/mine', requireAuth, validate(listQuerySchema, 'query'), listMyReviewsHandler);
reviewRouter.post('/', requireAuth, validate(createReviewSchema), createReviewHandler);
reviewRouter.patch('/:id', requireAuth, validate(updateReviewSchema), updateReviewHandler);
// Ownership (or admin override) is enforced inside deleteReview() — a plain
// customer role has no `reviews:delete` grant, so this stays a self-service
// route gated only by requireAuth, same pattern as orders' own-cancel endpoint.
reviewRouter.delete('/:id', requireAuth, deleteReviewHandler);
