import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCustomerDetail,
  listCustomers,
  setCustomerStatus,
} from '../../../../api/admin-customers.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useCustomersList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-customers', 'list', params],
    queryFn: () => listCustomers(params),
    placeholderData: (prev) => prev,
  });
}

export function useCustomerDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin-customers', 'detail', id],
    queryFn: () => getCustomerDetail(id as string),
    enabled: !!id,
  });
}

export function useSetCustomerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCustomerStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      toast.success('Customer status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
