import { BaseRepository } from '../../repositories/base.repository';

import { CategoryModel, type CategoryDocument } from './models/category.model';

export class CategoryRepository extends BaseRepository<CategoryDocument> {
  constructor() {
    super(CategoryModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean();
  }

  findChildren(parentId: string | null) {
    return this.model.find({ parentId }).sort({ order: 1 }).lean();
  }
}

export const categoryRepository = new CategoryRepository();
