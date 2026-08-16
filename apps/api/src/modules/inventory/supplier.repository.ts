import { BaseRepository } from '../../repositories/base.repository';

import { SupplierModel, type SupplierDocument } from './models/supplier.model';

export class SupplierRepository extends BaseRepository<SupplierDocument> {
  constructor() {
    super(SupplierModel);
  }
}

export const supplierRepository = new SupplierRepository();
