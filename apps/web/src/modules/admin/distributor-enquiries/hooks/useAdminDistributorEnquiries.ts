import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addDistributorEnquiryNote,
  assignDistributorEnquiry,
  getDistributorEnquiryAdmin,
  listAssignableStaff,
  listDistributorEnquiriesAdmin,
  updateDistributorEnquiryStatus,
  type DistributorEnquiryStatus,
} from '../../../../api/admin-distributor-enquiries.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminDistributorEnquiriesList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-distributor-enquiries', 'list', params],
    queryFn: () => listDistributorEnquiriesAdmin(params),
    placeholderData: (p) => p,
  });
}

export function useAdminDistributorEnquiry(id: string | null) {
  return useQuery({
    queryKey: ['admin-distributor-enquiries', 'detail', id],
    queryFn: () => getDistributorEnquiryAdmin(id as string),
    enabled: !!id,
  });
}

export function useAssignableStaff() {
  return useQuery({
    queryKey: ['admin-distributor-enquiries', 'assignable-staff'],
    queryFn: listAssignableStaff,
    staleTime: 5 * 60 * 1000,
  });
}

function useDistributorEnquiryAction<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-distributor-enquiries'] });
      toast.success(successMessage);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateDistributorEnquiryStatus() {
  return useDistributorEnquiryAction(
    ({ id, status }: { id: string; status: DistributorEnquiryStatus }) =>
      updateDistributorEnquiryStatus(id, status),
    'Status updated',
  );
}

export function useAssignDistributorEnquiry() {
  return useDistributorEnquiryAction(
    ({ id, adminUserId }: { id: string; adminUserId: string }) => assignDistributorEnquiry(id, adminUserId),
    'Enquiry assigned',
  );
}

export function useAddDistributorEnquiryNote() {
  return useDistributorEnquiryAction(
    ({ id, note }: { id: string; note: string }) => addDistributorEnquiryNote(id, note),
    'Note added',
  );
}
