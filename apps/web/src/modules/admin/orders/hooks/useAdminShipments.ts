import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addDeliveryNote,
  assignShipmentAwb,
  createShipment,
  createShiprocketShipment,
  downloadShipmentLabel,
  getDeliveryReport,
  getShipment,
  listShipments,
  retryShipment,
  syncShipmentTracking,
  updateShipmentStatus,
  type CreateShipmentInput,
  type UpdateShipmentStatusInput,
} from '../../../../api/shipments.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

export function useAdminShipmentsList(params: ListQueryParams) {
  return useQuery({
    queryKey: ['admin-shipments', 'list', params],
    queryFn: () => listShipments(params),
    placeholderData: (p) => p,
  });
}

export function useAdminShipment(id: string | null) {
  return useQuery({
    queryKey: ['admin-shipments', 'detail', id],
    queryFn: () => getShipment(id as string),
    enabled: !!id,
  });
}

export function useDeliveryReport() {
  return useQuery({
    queryKey: ['admin-shipments', 'report'],
    queryFn: () => getDeliveryReport(),
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShipmentInput) => createShipment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Shipment created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateShipmentStatusInput }) =>
      updateShipmentStatus(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Shipment status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddDeliveryNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => addDeliveryNote(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Delivery note saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateShiprocketShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => createShiprocketShipment(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Shiprocket shipment created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRetryShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => retryShipment(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Shipment retry triggered');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAssignShipmentAwb() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assignShipmentAwb(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('AWB assigned');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSyncShipmentTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => syncShipmentTracking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-shipments'] });
      toast.success('Tracking synced');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDownloadShipmentLabel() {
  return useMutation({
    mutationFn: (id: string) => downloadShipmentLabel(id),
    onSuccess: (data) => window.open(data.labelUrl, '_blank'),
    onError: (err: Error) => toast.error(err.message),
  });
}
