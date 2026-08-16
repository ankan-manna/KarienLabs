import { BaseRepository } from '../../repositories/base.repository';

import { BannerModel, type BannerDocument } from './models/banner.model';

export class BannerRepository extends BaseRepository<BannerDocument> {
  constructor() {
    super(BannerModel);
  }
}

export const bannerRepository = new BannerRepository();
