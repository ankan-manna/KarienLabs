import { manufacturerApi } from '../../../../api/catalog.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const manufacturerHooks = createCrudHooks('manufacturers', manufacturerApi);
