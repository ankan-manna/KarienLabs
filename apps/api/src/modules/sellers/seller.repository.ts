import { BaseRepository } from '../../repositories/base.repository';

import { SellerModel, type SellerDocument } from './models/seller.model';

export class SellerRepository extends BaseRepository<SellerDocument> {
  constructor() {
    super(SellerModel);
  }

  findByGstin(gstin: string) {
    return this.model.findOne({ gstin: gstin.toUpperCase() }).lean();
  }
}

export const sellerRepository = new SellerRepository();
