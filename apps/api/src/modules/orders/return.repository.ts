import { BaseRepository } from '../../repositories/base.repository';

import { ReturnModel, type ReturnDocument } from './models/return.model';

export class ReturnRepository extends BaseRepository<ReturnDocument> {
  constructor() {
    super(ReturnModel);
  }
}

export const returnRepository = new ReturnRepository();
