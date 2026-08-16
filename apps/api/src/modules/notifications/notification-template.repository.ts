import { BaseRepository } from '../../repositories/base.repository';

import {
  NotificationTemplateModel,
  type NotificationTemplateDocument,
} from './models/notification-template.model';

export class NotificationTemplateRepository extends BaseRepository<NotificationTemplateDocument> {
  constructor() {
    super(NotificationTemplateModel);
  }
}

export const notificationTemplateRepository = new NotificationTemplateRepository();
