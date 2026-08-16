import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approvePurchaseRequest,
  convertPurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  rejectPurchaseRequest,
  type ConvertPurchaseRequestInput,
  type CreatePurchaseRequestInput,
} from '../../../../api/purchase-requests.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminPurchaseRequestsList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-purchase-requests', 'list', params],
    queryFn: () => listPurchaseRequests(params),
    placeholderData: (p) => p,
  });
}

export function useAdminPurchaseRequest(id: string | null) {
  return useQuery({
    queryKey: ['admin-purchase-requests', 'detail', id],
    queryFn: () => getPurchaseRequest(id as string),
    enabled: !!id,
  });
}

function usePurchaseRequestAction<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-purchase-requests'] });
      toast.success(successMessage);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreatePurchaseRequest() {
  return usePurchaseRequestAction(
    (input: CreatePurchaseRequestInput) => createPurchaseRequest(input),
    'Purchase request submitted',
  );
}

export function useApprovePurchaseRequest() {
  return usePurchaseRequestAction((id: string) => approvePurchaseRequest(id), 'Purchase request approved');
}

export function useRejectPurchaseRequest() {
  return usePurchaseRequestAction(
    ({ id, reason }: { id: string; reason: string }) => rejectPurchaseRequest(id, reason),
    'Purchase request rejected',
  );
}

export function useConvertPurchaseRequest() {
  return usePurchaseRequestAction(
    ({ id, input }: { id: string; input: ConvertPurchaseRequestInput }) =>
      convertPurchaseRequest(id, input),
    'Converted to purchase order',
  );
}
