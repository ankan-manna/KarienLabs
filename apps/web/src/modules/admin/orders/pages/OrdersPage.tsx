import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { AdminOrder } from '../../../../api/orders-admin.api';
import { Badge } from '../../../../components/common/Badge';
import { DataTable } from '../../../../components/table/DataTable';
import { formatCurrency, formatDate } from '../../../../utils/format';
import { OrderDetailDrawer } from '../components/OrderDetailDrawer';
import { useAdminOrdersList } from '../hooks/useAdminOrders';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  placed: 'blue',
  confirmed: 'blue',
  packed: 'yellow',
  shipped: 'yellow',
  delivered: 'green',
  returned: 'red',
  cancelled: 'red',
};

const columns: ColumnDef<AdminOrder, unknown>[] = [
  { accessorKey: 'orderNumber', header: 'Order #' },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: 'totals',
    header: 'Total',
    enableSorting: false,
    cell: ({ row }) => formatCurrency(row.original.totals.grandTotal),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
    ),
  },
  {
    accessorKey: 'paymentStatus',
    header: 'Payment',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={row.original.paymentStatus === 'captured' ? 'green' : 'gray'}>
        {row.original.paymentStatus}
      </Badge>
    ),
  },
];

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading } = useAdminOrdersList({ page, limit, sort });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Orders</h1>

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
        onRowClick={(row) => setSelectedOrderId(row._id)}
      />

      <OrderDetailDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
