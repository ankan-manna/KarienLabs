import { notificationTemplateApi } from '../../../../api/notifications-admin.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const notificationTemplateHooks = createCrudHooks('notification-templates', notificationTemplateApi);
