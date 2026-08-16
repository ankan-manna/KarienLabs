import { brandApi } from '../../../../api/catalog.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const brandHooks = createCrudHooks('brands', brandApi);
