import { BaseRepository } from '../../repositories/base.repository';

import { DeliveryPartnerModel, type DeliveryPartnerDocument } from './models/delivery-partner.model';

export class DeliveryPartnerRepository extends BaseRepository<DeliveryPartnerDocument> {
  constructor() {
    super(DeliveryPartnerModel);
  }
}

export const deliveryPartnerRepository = new DeliveryPartnerRepository();
