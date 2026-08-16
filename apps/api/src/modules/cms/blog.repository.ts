import { BaseRepository } from '../../repositories/base.repository';

import { BlogModel, type BlogDocument } from './models/blog.model';

export class BlogRepository extends BaseRepository<BlogDocument> {
  constructor() {
    super(BlogModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug, deletedAt: null }).lean();
  }
}

export const blogRepository = new BlogRepository();
