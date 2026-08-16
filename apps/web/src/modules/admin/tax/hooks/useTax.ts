import { gstSettingApi } from '../../../../api/tax.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const gstSettingHooks = createCrudHooks('gst-settings', gstSettingApi);
