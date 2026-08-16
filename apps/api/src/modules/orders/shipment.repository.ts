import { BaseRepository } from '../../repositories/base.repository';

import { ShipmentModel, type ShipmentDocument } from './models/shipment.model';

export class ShipmentRepository extends BaseRepository<ShipmentDocument> {
  constructor() {
    super(ShipmentModel);
  }
}

export const shipmentRepository = new ShipmentRepository();
