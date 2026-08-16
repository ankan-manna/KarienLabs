import { BaseRepository } from '../../repositories/base.repository';

import { PurchaseOrderModel, type PurchaseOrderDocument } from './models/purchase-order.model';

export class PurchaseOrderRepository extends BaseRepository<PurchaseOrderDocument> {
  constructor() {
    super(PurchaseOrderModel);
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
