import { supplierApi } from '../../../../api/inventory.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const supplierHooks = createCrudHooks('suppliers', supplierApi);
