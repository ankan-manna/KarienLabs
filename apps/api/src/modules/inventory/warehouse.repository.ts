import { BaseRepository } from '../../repositories/base.repository';

import { WarehouseModel, type WarehouseDocument } from './models/warehouse.model';

export class WarehouseRepository extends BaseRepository<WarehouseDocument> {
  constructor() {
    super(WarehouseModel);
  }

  findByCode(code: string) {
    return this.model.findOne({ code: code.toUpperCase() }).lean();
  }
}

export const warehouseRepository = new WarehouseRepository();
