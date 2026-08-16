import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveReturn,
  createReturnReverseShipment,
  downloadReturnLabel,
  getReturn,
  inspectReturn,
  listReturns,
  markReturnPickedUp,
  receiveReturn,
  rejectReturn,
  resolveReturnRefund,
  resolveReturnReplacement,
  syncReturnTracking,
  type QcResult,
} from '../../../../api/returns.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminReturnsList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-returns', 'list', params],
    queryFn: () => listReturns(params),
    placeholderData: (p) => p,
  });
}

export function useAdminReturn(id: string | null) {
  return useQuery({
    queryKey: ['admin-returns', 'detail', id],
    queryFn: () => getReturn(id as string),
    enabled: !!id,
  });
}

function useReturnAction<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-returns'] });
      toast.success(successMessage);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApproveReturn() {
  return useReturnAction((id: string) => approveReturn(id), 'Return approved');
}

export function useRejectReturn() {
  return useReturnAction(
    ({ id, reason }: { id: string; reason: string }) => rejectReturn(id, reason),
    'Return rejected',
  );
}

export function useMarkReturnPickedUp() {
  return useReturnAction((id: string) => markReturnPickedUp(id), 'Marked as picked up');
}

export function useReceiveReturn() {
  return useReturnAction((id: string) => receiveReturn(id), 'Return received — awaiting inspection');
}

export function useInspectReturn() {
  return useReturnAction(
    ({ id, items }: { id: string; items: { orderItemId: string; qcResult: QcResult; notes?: string }[] }) =>
      inspectReturn(id, items),
    'Inspection recorded',
  );
}

export function useResolveReturnRefund() {
  return useReturnAction((id: string) => resolveReturnRefund(id), 'Refund initiated');
}

export function useResolveReturnReplacement() {
  return useReturnAction((id: string) => resolveReturnReplacement(id), 'Replacement order created');
}

export function useCreateReturnReverseShipment() {
  return useReturnAction((id: string) => createReturnReverseShipment(id), 'Reverse shipment created');
}

export function useSyncReturnTracking() {
  return useReturnAction((id: string) => syncReturnTracking(id), 'Tracking synced');
}

export function useDownloadReturnLabel() {
  return useMutation({
    mutationFn: (id: string) => downloadReturnLabel(id),
    onSuccess: (data) => window.open(data.labelUrl, '_blank'),
    onError: (err: Error) => toast.error(err.message),
  });
}
