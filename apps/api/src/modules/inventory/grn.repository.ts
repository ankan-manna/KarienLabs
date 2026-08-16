import { BaseRepository } from '../../repositories/base.repository';

import { GrnModel, type GrnDocument } from './models/grn.model';

export class GrnRepository extends BaseRepository<GrnDocument> {
  constructor() {
    super(GrnModel);
  }
}

export const grnRepository = new GrnRepository();
