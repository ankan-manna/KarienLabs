import { BaseRepository } from '../../repositories/base.repository';

import { FaqModel, type FaqDocument } from './models/faq.model';

export class FaqRepository extends BaseRepository<FaqDocument> {
  constructor() {
    super(FaqModel);
  }
}

export const faqRepository = new FaqRepository();
