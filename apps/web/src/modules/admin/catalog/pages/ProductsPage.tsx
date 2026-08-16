import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { Product } from '../../../../api/catalog.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { SearchBar } from '../../../../components/common/SearchBar';
import { DataTable } from '../../../../components/table/DataTable';
import { selectionColumn } from '../../../../components/table/selectionColumn';
import { formatCurrency } from '../../../../utils/format';
import { ProductFormDrawer } from '../components/ProductFormDrawer';
import { productHooks, useBulkDeleteProducts } from '../hooks/useProducts';

const columns: ColumnDef<Product, unknown>[] = [
  selectionColumn<Product>(),
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'sku', header: 'SKU', enableSorting: false },
  {
    accessorKey: 'basePrice',
    header: 'Price',
    cell: ({ row }) => formatCurrency(row.original.basePrice),
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

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const limit = 20;
  const { data, isLoading } = productHooks.useList({
    page,
    limit,
    sort,
    search: search || undefined,
  });
  const bulkDeleteMutation = useBulkDeleteProducts();

  function openCreate() {
    setEditingProduct(null);
    setIsFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setIsFormOpen(true);
  }

  async function handleBulkDelete() {
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    setConfirmingDelete(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Products</h1>
        <Can I="create" a="products">
          <Button onClick={openCreate}>New Product</Button>
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
        sort={sort}
        onSortChange={setSort}
        isLoading={isLoading}
        onRowClick={openEdit}
        enableRowSelection
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        toolbar={<SearchBar value={search} onChange={setSearch} placeholder="Search products…" />}
        bulkActions={
          <Can I="delete" a="products">
            <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete selected
            </Button>
          </Can>
        }
        emptyTitle="No products yet"
        emptyDescription="Create your first product to get started."
      />

      <ProductFormDrawer
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        product={editingProduct}
      />

      <ConfirmDialog
        isOpen={confirmingDelete}
        title="Delete products"
        message={`Delete ${selectedIds.size} selected product(s)? This can't be undone.`}
        confirmLabel="Delete"
        isDangerous
        isLoading={bulkDeleteMutation.isPending}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
