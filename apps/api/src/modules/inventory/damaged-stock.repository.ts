import { BaseRepository } from '../../repositories/base.repository';

import { DamagedStockModel, type DamagedStockDocument } from './models/damaged-stock.model';

export class DamagedStockRepository extends BaseRepository<DamagedStockDocument> {
  constructor() {
    super(DamagedStockModel);
  }
}

export const damagedStockRepository = new DamagedStockRepository();
