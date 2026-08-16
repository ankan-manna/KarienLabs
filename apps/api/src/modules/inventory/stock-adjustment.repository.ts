import { BaseRepository } from '../../repositories/base.repository';

import {
  StockAdjustmentModel,
  type StockAdjustmentDocument,
} from './models/stock-adjustment.model';

export class StockAdjustmentRepository extends BaseRepository<StockAdjustmentDocument> {
  constructor() {
    super(StockAdjustmentModel);
  }
}

export const stockAdjustmentRepository = new StockAdjustmentRepository();
