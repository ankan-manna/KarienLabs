import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPaymentDetail, issueRefund, listPayments } from '../../../../api/admin-payments.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function usePaymentsList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-payments', 'list', params],
    queryFn: () => listPayments(params),
    placeholderData: (prev) => prev,
  });
}

export function usePaymentDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin-payments', 'detail', id],
    queryFn: () => getPaymentDetail(id as string),
    enabled: !!id,
  });
}

export function useIssueRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => issueRefund(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      toast.success('Refund issued');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
