import { useMutation, useQueryClient } from '@tanstack/react-query';

import { bulkDeleteProducts, productApi } from '../../../../api/catalog.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';
import { toast } from '../../../../utils/toast';

export const productHooks = createCrudHooks('products', productApi);

export function useBulkDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteProducts(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
      toast.success('Products deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
