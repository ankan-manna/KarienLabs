import { BaseRepository } from '../../repositories/base.repository';

import { ReviewModel, type ReviewDocument } from './models/review.model';

export class ReviewRepository extends BaseRepository<ReviewDocument> {
  constructor() {
    super(ReviewModel);
  }

  findByProductAndUser(productId: string, userId: string) {
    return this.model.findOne({ productId, userId, deletedAt: null });
  }
}

export const reviewRepository = new ReviewRepository();
