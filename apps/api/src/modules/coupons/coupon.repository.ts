import { BaseRepository } from '../../repositories/base.repository';

import { CouponModel, type CouponDocument } from './models/coupon.model';

export class CouponRepository extends BaseRepository<CouponDocument> {
  constructor() {
    super(CouponModel);
  }

  findByCode(code: string) {
    return this.model.findOne({ code: code.toUpperCase() });
  }
}

export const couponRepository = new CouponRepository();
