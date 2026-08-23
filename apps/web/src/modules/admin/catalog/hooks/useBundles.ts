import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bundleApi, type BundleInput } from '../../../../api/bundles.api';
import type { ListQueryParams } from '../../../../api/types';
import { toast } from '../../../../utils/toast';

/**
 * Hand-written (not `createCrudHooks`) because Bundle's API client doesn't
 * implement bulk-edit/bulk-delete/export/import (no backend support for
 * those on this resource yet) — `createCrudHooks` is typed against the full
 * `createCrudApi` shape, so it doesn't fit here without adding endpoints
 * this  doesn't call for. Same react-query patterns either way.
 */
export const bundleHooks = {
  useList(params: ListQueryParams) {
    return useQuery({
      queryKey: ['bundles', 'list', params],
      queryFn: () => bundleApi.list(params),
      placeholderData: (prev) => prev,
    });
  },
  useDetail(id: string | null) {
    return useQuery({
      queryKey: ['bundles', 'detail', id],
      queryFn: () => bundleApi.getById(id as string),
      enabled: !!id,
    });
  },
  useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: BundleInput) => bundleApi.create(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bundles', 'list'] });
        toast.success('Bundle created');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  },
  useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: Partial<BundleInput> }) =>
        bundleApi.update(id, input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bundles', 'list'] });
        queryClient.invalidateQueries({ queryKey: ['bundles', 'detail'] });
        toast.success('Bundle updated');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  },
  useRemove() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => bundleApi.remove(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bundles', 'list'] });
        toast.success('Bundle deleted');
      },
      onError: (err: Error) => toast.error(err.message),
    });
  },
};
