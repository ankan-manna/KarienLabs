import type { OrderStatus } from '@medcommerce/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getOrder, listOrders, updateOrderStatus } from '../../../../api/orders-admin.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminOrdersList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-orders', 'list', params],
    queryFn: () => listOrders(params),
    placeholderData: (p) => p,
  });
}

export function useAdminOrder(id: string | null) {
  return useQuery({
    queryKey: ['admin-orders', 'detail', id],
    queryFn: () => getOrder(id as string),
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      updateOrderStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
