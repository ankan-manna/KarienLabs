import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { damagedStockApi, warehouseApi, type DamagedStockReport } from '../../../../api/inventory.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { Textarea } from '../../../../components/common/Textarea';
import { DataTable } from '../../../../components/table/DataTable';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';
import { formatDateTime } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const damagedStockHooks = createCrudHooks('damaged-stock', damagedStockApi);
const warehouseHooks = createCrudHooks('warehouses', warehouseApi);

const formSchema = z.object({
  batchId: z.string().trim().min(1, 'Batch ID is required'),
  warehouseId: z.string().trim().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, 'Reason is required'),
});
type FormValues = z.infer<typeof formSchema>;

export default function DamagedStockPage() {
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewing, setViewing] = useState<DamagedStockReport | null>(null);
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = damagedStockHooks.useList({ page, limit });
  const { data: warehouses } = warehouseHooks.useList({ page: 1, limit: 100 });

  const reportMutation = useMutation({
    mutationFn: (values: FormValues) => damagedStockApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damaged-stock', 'list'] });
      toast.success('Damage report submitted');
      setIsFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => damagedStockApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damaged-stock', 'list'] });
      toast.success('Write-off approved — stock deducted');
      setViewing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => damagedStockApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damaged-stock', 'list'] });
      toast.success('Report dismissed');
      setViewing(null);
      setConfirmingDismiss(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const columns: ColumnDef<DamagedStockReport, unknown>[] = [
    { accessorKey: 'batchId', header: 'Batch', cell: ({ row }) => <span className="font-mono text-xs">{row.original.batchId}</span> },
    { accessorKey: 'quantity', header: 'Qty' },
    { accessorKey: 'reason', header: 'Reason' },
    {
      accessorKey: 'approvedAt',
      header: 'Status',
      cell: ({ row }) => (
        <Badge tone={row.original.approvedAt ? 'green' : 'yellow'}>
          {row.original.approvedAt ? 'Approved' : 'Pending'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Reported',
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Damaged Stock</h1>
        <Can I="update" a="inventory">
          <Button
            onClick={() => {
              reset({ batchId: '', warehouseId: '', quantity: 1, reason: '' });
              setIsFormOpen(true);
            }}
          >
            Report Damage
          </Button>
        </Can>
      </div>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={setViewing}
      />

      <Drawer isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="Report Damaged Stock">
        <form
          onSubmit={handleSubmit((values) => reportMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <Input
            label="Batch ID"
            placeholder="Paste the Batch's ObjectId"
            error={errors.batchId?.message}
            {...register('batchId')}
          />
          <Select
            label="Warehouse"
            options={(warehouses?.items ?? []).map((w) => ({ label: w.name, value: w._id }))}
            error={errors.warehouseId?.message}
            {...register('warehouseId')}
          />
          <Input
            label="Quantity"
            type="number"
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <Textarea label="Reason" error={errors.reason?.message} {...register('reason')} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Submit
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer isOpen={!!viewing} onClose={() => setViewing(null)} title="Damage Report">
        {viewing && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-gray-500">Batch</dt>
              <dd className="font-mono text-xs">{viewing.batchId}</dd>
              <dt className="text-gray-500">Quantity</dt>
              <dd>{viewing.quantity}</dd>
              <dt className="text-gray-500">Reason</dt>
              <dd>{viewing.reason}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <Badge tone={viewing.approvedAt ? 'green' : 'yellow'}>
                  {viewing.approvedAt ? 'Approved' : 'Pending'}
                </Badge>
              </dd>
              <dt className="text-gray-500">Reported</dt>
              <dd>{formatDateTime(viewing.createdAt)}</dd>
            </dl>
            {!viewing.approvedAt && (
              <div className="flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                <Can I="approve" a="inventory">
                  <Button isLoading={approveMutation.isPending} onClick={() => approveMutation.mutate(viewing._id)}>
                    Approve Write-off
                  </Button>
                </Can>
                <Button variant="outline" onClick={() => setConfirmingDismiss(true)}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        isOpen={confirmingDismiss}
        title="Dismiss report"
        message="Dismiss this damage report? No stock will be affected."
        confirmLabel="Dismiss"
        isDangerous
        isLoading={dismissMutation.isPending}
        onConfirm={() => viewing && dismissMutation.mutate(viewing._id)}
        onCancel={() => setConfirmingDismiss(false)}
      />
    </div>
  );
}
