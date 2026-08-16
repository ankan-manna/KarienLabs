import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { stockTransferApi, warehouseApi, type StockTransfer } from '../../../../api/inventory.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';
import { formatDateTime } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const stockTransferHooks = createCrudHooks('stock-transfers', stockTransferApi);
const warehouseHooks = createCrudHooks('warehouses', warehouseApi);

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  pending: 'yellow',
  in_transit: 'yellow',
  received: 'green',
  cancelled: 'red',
};

const formSchema = z
  .object({
    batchId: z.string().trim().min(1, 'Batch ID is required'),
    fromWarehouseId: z.string().trim().min(1, 'Source warehouse is required'),
    toWarehouseId: z.string().trim().min(1, 'Destination warehouse is required'),
    quantity: z.coerce.number().int().min(1),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: 'Source and destination must differ',
    path: ['toWarehouseId'],
  });
type FormValues = z.infer<typeof formSchema>;

export default function StockTransfersPage() {
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewing, setViewing] = useState<StockTransfer | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = stockTransferHooks.useList({ page, limit });
  const { data: warehouses } = warehouseHooks.useList({ page: 1, limit: 100 });

  const requestMutation = useMutation({
    mutationFn: (values: FormValues) => stockTransferApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers', 'list'] });
      toast.success('Transfer requested');
      setIsFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => stockTransferApi.receive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers', 'list'] });
      toast.success('Transfer received — stock moved');
      setViewing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => stockTransferApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers', 'list'] });
      toast.success('Transfer cancelled');
      setViewing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const warehouseOptions = (warehouses?.items ?? []).map((w) => ({ label: w.name, value: w._id }));

  const columns: ColumnDef<StockTransfer, unknown>[] = [
    { accessorKey: 'batchId', header: 'Batch', cell: ({ row }) => <span className="font-mono text-xs">{row.original.batchId}</span> },
    { accessorKey: 'quantity', header: 'Qty' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status]}>{row.original.status}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Requested',
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Stock Transfers</h1>
        <Can I="update" a="inventory">
          <Button
            onClick={() => {
              reset({ batchId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 1 });
              setIsFormOpen(true);
            }}
          >
            New Transfer
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

      <Drawer isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="Request Stock Transfer">
        <form
          onSubmit={handleSubmit((values) => requestMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <Input
            label="Batch ID"
            placeholder="Paste the Batch's ObjectId"
            error={errors.batchId?.message}
            {...register('batchId')}
          />
          <Select
            label="From Warehouse"
            options={warehouseOptions}
            error={errors.fromWarehouseId?.message}
            {...register('fromWarehouseId')}
          />
          <Select
            label="To Warehouse"
            options={warehouseOptions}
            error={errors.toWarehouseId?.message}
            {...register('toWarehouseId')}
          />
          <Input
            label="Quantity"
            type="number"
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Request
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer isOpen={!!viewing} onClose={() => setViewing(null)} title="Stock Transfer">
        {viewing && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-gray-500">Batch</dt>
              <dd className="font-mono text-xs">{viewing.batchId}</dd>
              <dt className="text-gray-500">Quantity</dt>
              <dd>{viewing.quantity}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <Badge tone={STATUS_TONE[viewing.status]}>{viewing.status}</Badge>
              </dd>
              <dt className="text-gray-500">Requested</dt>
              <dd>{formatDateTime(viewing.createdAt)}</dd>
              {viewing.receivedAt && (
                <>
                  <dt className="text-gray-500">Received</dt>
                  <dd>{formatDateTime(viewing.receivedAt)}</dd>
                </>
              )}
            </dl>
            {viewing.status === 'pending' && (
              <div className="flex gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                <Can I="approve" a="inventory">
                  <Button isLoading={receiveMutation.isPending} onClick={() => receiveMutation.mutate(viewing._id)}>
                    Mark Received
                  </Button>
                </Can>
                <Button
                  variant="outline"
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(viewing._id)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
