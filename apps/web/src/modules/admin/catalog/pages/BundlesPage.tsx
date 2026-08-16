import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { Bundle } from '../../../../api/bundles.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { DataTable } from '../../../../components/table/DataTable';
import { formatCurrency } from '../../../../utils/format';
import { BundleFormDrawer } from '../components/BundleFormDrawer';
import { bundleHooks } from '../hooks/useBundles';

const columns: ColumnDef<Bundle, unknown>[] = [
  {
    id: 'product',
    header: 'Bundle',
    enableSorting: false,
    cell: ({ row }) => row.original.product?.name ?? row.original.productId,
  },
  {
    id: 'sku',
    header: 'SKU',
    enableSorting: false,
    cell: ({ row }) => row.original.product?.sku ?? '—',
  },
  {
    accessorKey: 'sellingPrice',
    header: 'Selling Price',
    cell: ({ row }) => formatCurrency(row.original.sellingPrice),
  },
  {
    accessorKey: 'availableQty',
    header: 'Stock',
    enableSorting: false,
    cell: ({ row }) => {
      const qty = row.original.availableQty;
      return (
        <Badge tone={qty > 0 ? 'green' : 'red'}>
          {qty > 0 ? `${qty} available` : 'Out of stock'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={row.original.isActive ? 'green' : 'gray'}>
        {row.original.isActive ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
];

export default function BundlesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = bundleHooks.useList({ page, limit });
  const { data: editingBundle } = bundleHooks.useDetail(editingId);
  const removeMutation = bundleHooks.useRemove();

  function openCreate() {
    setEditingId(null);
    setIsFormOpen(true);
  }

  function openEdit(bundle: Bundle) {
    setEditingId(bundle._id);
    setIsFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Bundles</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Combo-packs sold at an independently-set price — components are drawn from existing
            inventory via the normal FEFO reservation logic at checkout.
          </p>
        </div>
        <Can I="create" a="bundles">
          <Button onClick={openCreate}>New Bundle</Button>
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
        onRowClick={openEdit}
        emptyTitle="No bundles yet"
        emptyDescription="Create a combo-pack from existing catalog products to get started."
      />

      <BundleFormDrawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        bundle={editingId ? (editingBundle ?? null) : null}
        onRequestDelete={setDeletingId}
      />

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Delete bundle"
        message="Delete this bundle configuration? The underlying product and its inventory are unaffected — only the bundle/combo-pack pricing and component list are removed."
        confirmLabel="Delete"
        isDangerous
        isLoading={removeMutation.isPending}
        onConfirm={async () => {
          if (deletingId) await removeMutation.mutateAsync(deletingId);
          setDeletingId(null);
          setIsFormOpen(false);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
