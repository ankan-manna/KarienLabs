import { BaseRepository } from '../../repositories/base.repository';

import { GstSettingModel, type GstSettingDocument } from './models/gst-setting.model';

export class GstSettingRepository extends BaseRepository<GstSettingDocument> {
  constructor() {
    super(GstSettingModel);
  }
}

export const gstSettingRepository = new GstSettingRepository();
