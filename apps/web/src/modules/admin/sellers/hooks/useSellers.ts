import { sellerApi } from '../../../../api/sellers.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const sellerHooks = createCrudHooks('sellers', sellerApi);
