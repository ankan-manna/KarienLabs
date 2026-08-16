import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { createCrudApi } from '../api/createCrudApi';
import type { ListQueryParams } from '../api/types';
import { toast } from '../utils/toast';

/** Wraps a createCrudApi() client with React Query hooks — list/get/create/update/remove, cache invalidation, and toasts, once per resource. */
export function createCrudHooks<T, TCreateInput, TUpdateInput>(
  resourceKey: string,
  api: ReturnType<typeof createCrudApi<T, TCreateInput, TUpdateInput>>,
) {
  function useList(params: ListQueryParams) {
    return useQuery({
      queryKey: [resourceKey, 'list', params],
      queryFn: () => api.list(params),
      placeholderData: (prev) => prev,
    });
  }

  function useDetail(id: string | null) {
    return useQuery({
      queryKey: [resourceKey, 'detail', id],
      queryFn: () => api.getById(id as string),
      enabled: !!id,
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: TCreateInput) => api.create(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'list'] });
        toast.success('Created successfully');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: TUpdateInput }) => api.update(id, input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'list'] });
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'detail'] });
        toast.success('Updated successfully');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  function useRemove() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.remove(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'list'] });
        toast.success('Deleted successfully');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  function useBulkDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (ids: string[]) => api.bulkDelete(ids),
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'list'] });
        toast.success(`Deleted ${result.succeeded} of ${result.requested} record(s)`);
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  function useBulkEdit() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) =>
        api.bulkEdit(ids, patch),
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: [resourceKey, 'list'] });
        toast.success(`Updated ${result.succeeded} of ${result.requested} record(s)`);
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }

  return { useList, useDetail, useCreate, useUpdate, useRemove, useBulkDelete, useBulkEdit };
}
