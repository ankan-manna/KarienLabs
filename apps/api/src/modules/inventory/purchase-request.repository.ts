import { BaseRepository } from '../../repositories/base.repository';

import { PurchaseRequestModel, type PurchaseRequestDocument } from './models/purchase-request.model';

export class PurchaseRequestRepository extends BaseRepository<PurchaseRequestDocument> {
  constructor() {
    super(PurchaseRequestModel);
  }
}

export const purchaseRequestRepository = new PurchaseRequestRepository();
