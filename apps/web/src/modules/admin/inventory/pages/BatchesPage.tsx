import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import {
  BATCH_STATUS_OPTIONS,
  fetchLowStockReport,
  fetchNearExpiryReport,
  listBatches,
  setBatchRecallFlag,
  updateBatchMrp,
  updateBatchStatus,
  type Batch,
  type BatchStatus,
} from '../../../../api/inventory.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Card } from '../../../../components/common/Card';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { EmptyState } from '../../../../components/common/EmptyState';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDate } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const STATUS_TONE: Record<BatchStatus, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  active: 'green',
  expired: 'red',
  flagged: 'yellow',
  exhausted: 'gray',
};

function useUpdateBatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BatchStatus }) =>
      updateBatchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

function BatchStatusAction({ batchId, status }: { batchId: string; status: BatchStatus }) {
  const updateStatus = useUpdateBatchStatus();
  return (
    <Can I="update" a="batches">
      <Select
        options={BATCH_STATUS_OPTIONS}
        value={status}
        disabled={updateStatus.isPending}
        onChange={(e) => updateStatus.mutate({ id: batchId, status: e.target.value as BatchStatus })}
        className="w-32"
      />
    </Can>
  );
}

/** CAT-04 — inline MRP-override editor. Blank/cleared -> `null` -> falls back to Product.mrp (see batch-pricing.util.ts on the backend). */
function BatchMrpAction({ batch }: { batch: Batch }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(batch.mrp != null ? String(batch.mrp) : '');

  const mutation = useMutation({
    mutationFn: (mrp: number | null) => updateBatchMrp(batch._id, mrp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success('Batch MRP updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function save() {
    const trimmed = value.trim();
    mutation.mutate(trimmed === '' ? null : Number(trimmed));
  }

  return (
    <Can I="update" a="batches">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="0.01"
          placeholder={`Product: ${batch.effectiveMrp ?? '—'}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          isLoading={mutation.isPending}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </Can>
  );
}

/** Part 5/CAT-04 — recall toggle. Enabling shows a clear warning before it takes effect (never silently modifies quantityAvailable — only blocks future reservation, see order.service.ts's decrementStockFifo). */
function BatchRecallAction({ batch }: { batch: Batch }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: (recallFlag: boolean) => setBatchRecallFlag(batch._id, recallFlag),
    onSuccess: (_data, recallFlag) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      toast.success(recallFlag ? 'Batch recalled' : 'Recall cleared');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (batch.recallFlag) {
    return (
      <Can I="update" a="batches">
        <div className="flex items-center gap-2">
          <Badge tone="red">Recalled</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            Clear recall
          </Button>
        </div>
      </Can>
    );
  }

  return (
    <Can I="update" a="batches">
      <Button type="button" size="sm" variant="danger" onClick={() => setConfirming(true)}>
        Recall
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        title="Recall this batch"
        message="Recalling blocks this batch from any NEW sale/reservation — existing orders and physical stock are left untouched. This does not delete or zero out inventory. Continue?"
        confirmLabel="Recall batch"
        isDangerous
        isLoading={mutation.isPending}
        onConfirm={async () => {
          await mutation.mutateAsync(true);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </Can>
  );
}

export default function BatchesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: lowStock, isLoading: isLoadingLowStock } = useQuery({
    queryKey: ['batches', 'low-stock'],
    queryFn: fetchLowStockReport,
  });
  const { data: nearExpiry, isLoading: isLoadingNearExpiry } = useQuery({
    queryKey: ['batches', 'near-expiry'],
    queryFn: () => fetchNearExpiryReport(30),
  });
  const { data: batches, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['batches', 'list', { page, limit }],
    queryFn: () => listBatches({ page, limit, sort: '-expiryDate' }),
    placeholderData: (prev) => prev,
  });

  const columns: ColumnDef<Batch, unknown>[] = [
    {
      accessorKey: 'batchNumber',
      header: 'Batch',
      enableSorting: false,
    },
    {
      accessorKey: 'productId',
      header: 'Product',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.productId}</span>,
    },
    {
      accessorKey: 'warehouseId',
      header: 'Warehouse',
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.warehouseId}</span>,
    },
    {
      accessorKey: 'expiryDate',
      header: 'Expiry Date',
      cell: ({ row }) => formatDate(row.original.expiryDate),
    },
    {
      accessorKey: 'quantityAvailable',
      header: 'Available',
    },
    {
      id: 'mrp',
      header: 'MRP Override',
      enableSorting: false,
      cell: ({ row }) => <BatchMrpAction batch={row.original} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
          {row.original.recallFlag && <Badge tone="red">Recalled</Badge>}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col gap-2">
          <BatchStatusAction batchId={row.original._id} status={row.original.status} />
          <BatchRecallAction batch={row.original} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Batches &amp; Expiry
      </h1>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Low Stock</h2>
        {isLoadingLowStock ? (
          <SkeletonRows rows={3} columns={4} />
        ) : !lowStock || lowStock.length === 0 ? (
          <EmptyState
            title="No low-stock items"
            description="All products are above their reorder level."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="py-1.5 font-medium">Product</th>
                <th className="py-1.5 font-medium">SKU</th>
                <th className="py-1.5 font-medium">Available</th>
                <th className="py-1.5 font-medium">Reorder Level</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((item) => (
                <tr
                  key={`${item.productId}-${item.warehouseId}`}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <td className="py-1.5">{item.productName}</td>
                  <td className="py-1.5 text-gray-500">{item.sku}</td>
                  <td className="py-1.5">
                    <Badge tone="red">{item.totalAvailable}</Badge>
                  </td>
                  <td className="py-1.5 text-gray-500">{item.reorderLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Expiring Within 30 Days
        </h2>
        {isLoadingNearExpiry ? (
          <SkeletonRows rows={3} columns={4} />
        ) : !nearExpiry || nearExpiry.length === 0 ? (
          <EmptyState title="Nothing expiring soon" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="py-1.5 font-medium">Batch</th>
                <th className="py-1.5 font-medium">Expiry Date</th>
                <th className="py-1.5 font-medium">Quantity</th>
                <th className="py-1.5 font-medium">Status</th>
                <th className="py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nearExpiry.map((batch) => (
                <tr key={batch._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1.5">{batch.batchNumber}</td>
                  <td className="py-1.5">
                    <Badge tone="yellow">{formatDate(batch.expiryDate)}</Badge>
                  </td>
                  <td className="py-1.5 text-gray-500">{batch.quantityAvailable}</td>
                  <td className="py-1.5">
                    <Badge tone={STATUS_TONE[batch.effectiveStatus] ?? 'gray'}>
                      {batch.effectiveStatus}
                    </Badge>
                  </td>
                  <td className="py-1.5">
                    <BatchStatusAction batchId={batch._id} status={batch.effectiveStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">All Batches</h2>
        <DataTable
          data={batches?.items ?? []}
          columns={columns}
          getRowId={(row) => row._id}
          totalCount={batches?.meta.total ?? 0}
          page={page}
          limit={limit}
          onPageChange={setPage}
          isLoading={isLoadingBatches}
        />
      </Card>
    </div>
  );
}
