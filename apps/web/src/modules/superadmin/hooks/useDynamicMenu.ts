import { dynamicMenuApi } from '../../../api/dynamic-menu.api';
import { createCrudHooks } from '../../../hooks/createCrudHooks';

export const dynamicMenuHooks = createCrudHooks('dynamic-menu', dynamicMenuApi);
