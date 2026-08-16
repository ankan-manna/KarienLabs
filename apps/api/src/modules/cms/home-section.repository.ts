import { BaseRepository } from '../../repositories/base.repository';

import { HomeSectionModel, type HomeSectionDocument } from './models/home-section.model';

export class HomeSectionRepository extends BaseRepository<HomeSectionDocument> {
  constructor() {
    super(HomeSectionModel);
  }
}

export const homeSectionRepository = new HomeSectionRepository();
