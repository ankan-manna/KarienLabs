import { warehouseApi } from '../../../../api/inventory.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const warehouseHooks = createCrudHooks('warehouses', warehouseApi);
