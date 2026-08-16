import { BaseRepository } from '../../repositories/base.repository';

import { ShippingZoneModel, type ShippingZoneDocument } from './models/shipping-zone.model';

export class ShippingZoneRepository extends BaseRepository<ShippingZoneDocument> {
  constructor() {
    super(ShippingZoneModel);
  }
}

export const shippingZoneRepository = new ShippingZoneRepository();
