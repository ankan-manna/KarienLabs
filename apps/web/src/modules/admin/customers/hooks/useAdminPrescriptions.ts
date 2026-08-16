import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approvePrescription,
  getPrescription,
  listPrescriptionsAdmin,
  rejectPrescription,
} from '../../../../api/prescriptions.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminPrescriptionsList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-prescriptions', 'list', params],
    queryFn: () => listPrescriptionsAdmin(params),
    placeholderData: (p) => p,
  });
}

export function useAdminPrescription(id: string | null) {
  return useQuery({
    queryKey: ['admin-prescriptions', 'detail', id],
    queryFn: () => getPrescription(id as string),
    enabled: !!id,
  });
}

function usePrescriptionAction<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prescriptions'] });
      toast.success(successMessage);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApprovePrescription() {
  return usePrescriptionAction((id: string) => approvePrescription(id), 'Prescription verified');
}

export function useRejectPrescription() {
  return usePrescriptionAction(
    ({ id, reason }: { id: string; reason: string }) => rejectPrescription(id, reason),
    'Prescription rejected',
  );
}
