import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { createProductTaxMapping, listProductTaxMappings } from '../../../../api/tax.api';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Drawer } from '../../../../components/common/Drawer';
import { EmptyState } from '../../../../components/common/EmptyState';
import { Input } from '../../../../components/common/Input';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { formatDate } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const formSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  hsnCode: z.string().trim().min(1, 'HSN code is required'),
  gstRate: z.coerce.number().min(0).max(28),
});
type FormValues = z.infer<typeof formSchema>;

/**
 * Product-tax-mapping history is append-only on the backend (see
 * tax/product-tax-mapping.service.ts) — this page mirrors that: create + list
 * only, no edit/delete, so it's a bespoke page rather than ConfigEntityPage
 * (which assumes full CRUD). Product selection is a pasted Product ID for now —
 * a searchable product picker is a reasonable follow-up, not built this pass.
 */
export default function ProductTaxMappingsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['product-tax-mappings'],
    queryFn: () => listProductTaxMappings(),
  });

  const createMutation = useMutation({
    mutationFn: createProductTaxMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-tax-mappings'] });
      toast.success('Tax mapping created');
      setIsFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">
          Product Tax Mappings
        </h1>
        <Can I="update" a="tax">
          <Button onClick={() => setIsFormOpen(true)}>New Mapping</Button>
        </Can>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-gray-50 dark:bg-night-surface">
            <tr>
              <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-night-muted">Product ID</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-night-muted">HSN Code</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-night-muted">GST Rate</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-night-muted">Effective From</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-night-muted">Effective To</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-4">
                  <SkeletonRows columns={5} />
                </td>
              </tr>
            ) : !data?.length ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No tax mappings yet" />
                </td>
              </tr>
            ) : (
              data.map((m) => (
                <tr key={m._id} className="border-t border-gray-100 dark:border-night-border/60">
                  <td className="px-4 py-2.5 font-mono text-xs">{m.productId}</td>
                  <td className="px-4 py-2.5">{m.hsnCode}</td>
                  <td className="px-4 py-2.5">{m.gstRate}%</td>
                  <td className="px-4 py-2.5">{formatDate(m.effectiveFrom)}</td>
                  <td className="px-4 py-2.5">{m.effectiveTo ? formatDate(m.effectiveTo) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Tax Mapping">
        <form
          onSubmit={handleSubmit((values) => createMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <Input
            label="Product ID"
            placeholder="Paste the Product's ObjectId"
            error={errors.productId?.message}
            {...register('productId')}
          />
          <Input label="HSN Code" error={errors.hsnCode?.message} {...register('hsnCode')} />
          <Input
            label="GST Rate (%)"
            type="number"
            error={errors.gstRate?.message}
            {...register('gstRate')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
