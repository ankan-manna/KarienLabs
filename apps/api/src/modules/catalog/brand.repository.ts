import { BaseRepository } from '../../repositories/base.repository';

import { BrandModel, type BrandDocument } from './models/brand.model';

export class BrandRepository extends BaseRepository<BrandDocument> {
  constructor() {
    super(BrandModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean();
  }
}

export const brandRepository = new BrandRepository();
