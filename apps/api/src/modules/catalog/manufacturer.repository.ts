import { BaseRepository } from '../../repositories/base.repository';

import { ManufacturerModel, type ManufacturerDocument } from './models/manufacturer.model';

export class ManufacturerRepository extends BaseRepository<ManufacturerDocument> {
  constructor() {
    super(ManufacturerModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean();
  }
}

export const manufacturerRepository = new ManufacturerRepository();
