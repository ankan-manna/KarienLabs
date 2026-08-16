import { BaseRepository } from '../../repositories/base.repository';

import { StockTransferModel, type StockTransferDocument } from './models/stock-transfer.model';

export class StockTransferRepository extends BaseRepository<StockTransferDocument> {
  constructor() {
    super(StockTransferModel);
  }
}

export const stockTransferRepository = new StockTransferRepository();
