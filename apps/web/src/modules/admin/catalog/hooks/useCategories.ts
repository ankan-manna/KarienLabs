import { categoryApi } from '../../../../api/catalog.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const categoryHooks = createCrudHooks('categories', categoryApi);
