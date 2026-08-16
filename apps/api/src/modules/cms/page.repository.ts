import { BaseRepository } from '../../repositories/base.repository';

import { PageModel, type PageDocument } from './models/page.model';

export class PageRepository extends BaseRepository<PageDocument> {
  constructor() {
    super(PageModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug, deletedAt: null }).lean();
  }
}

export const pageRepository = new PageRepository();
