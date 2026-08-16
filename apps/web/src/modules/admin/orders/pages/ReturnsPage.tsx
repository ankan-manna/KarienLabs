import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import { warehouseApi } from '../../../../api/inventory.api';
import type { ReturnRequest } from '../../../../api/returns.api';
import { sellerApi } from '../../../../api/sellers.api';
import { Badge } from '../../../../components/common/Badge';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDate } from '../../../../utils/format';
import { ReturnDetailDrawer } from '../components/ReturnDetailDrawer';
import { useAdminReturnsList } from '../hooks/useAdminReturns';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  requested: 'blue',
  approved: 'yellow',
  rejected: 'red',
  picked_up: 'yellow',
  received: 'yellow',
  inspected: 'yellow',
  refunded: 'green',
  replaced: 'green',
};

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Requested', value: 'requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'Received', value: 'received' },
  { label: 'Inspected', value: 'inspected' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Replaced', value: 'replaced' },
];

const columns: ColumnDef<ReturnRequest, unknown>[] = [
  {
    accessorKey: 'returnNumber',
    header: 'Return #',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.returnNumber || row.original._id.slice(-8)}</span>
    ),
  },
  {
    accessorKey: 'orderId',
    header: 'Order',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.orderId.slice(-8)}</span>,
  },
  {
    accessorKey: 'items',
    header: 'Items',
    enableSorting: false,
    cell: ({ row }) => row.original.items.reduce((sum, i) => sum + i.quantity, 0),
  },
  {
    accessorKey: 'resolutionType',
    header: 'Resolution',
    enableSorting: false,
    cell: ({ row }) => row.original.resolutionType ?? '—',
  },
  {
    accessorKey: 'createdAt',
    header: 'Requested',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
    ),
  },
];

export default function ReturnsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 20;

  const { data: sellersResult } = useQuery({
    queryKey: ['sellers', 'list', 'for-return-filter'],
    queryFn: () => sellerApi.list({ page: 1, limit: 100 }),
  });
  const { data: warehousesResult } = useQuery({
    queryKey: ['warehouses', 'list', 'for-return-filter'],
    queryFn: () => warehouseApi.list({ page: 1, limit: 100 }),
  });

  const filter: Record<string, string> = {};
  if (status) filter.status = status;
  if (sellerId) filter.sellerId = sellerId;
  if (warehouseId) filter.warehouseId = warehouseId;
  if (orderId.trim()) filter.orderId = orderId.trim();
  if (customerId.trim()) filter.customerId = customerId.trim();
  if (dateFrom) filter.dateFrom = dateFrom;
  if (dateTo) filter.dateTo = dateTo;

  const { data, isLoading } = useAdminReturnsList({ page, limit, sort, filter });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Return Requests</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          options={STATUS_OPTIONS}
        />
        <Select
          label="Seller"
          value={sellerId}
          onChange={(e) => {
            setPage(1);
            setSellerId(e.target.value);
          }}
          options={[
            { label: 'All sellers', value: '' },
            ...(sellersResult?.items ?? []).map((s) => ({ label: s.legalName, value: s._id })),
          ]}
        />
        <Select
          label="Warehouse"
          value={warehouseId}
          onChange={(e) => {
            setPage(1);
            setWarehouseId(e.target.value);
          }}
          options={[
            { label: 'All warehouses', value: '' },
            ...(warehousesResult?.items ?? []).map((w) => ({ label: w.name, value: w._id })),
          ]}
        />
        <Input
          label="Order ID"
          value={orderId}
          onChange={(e) => {
            setPage(1);
            setOrderId(e.target.value);
          }}
          placeholder="Order ObjectId"
        />
        <Input
          label="Customer ID"
          value={customerId}
          onChange={(e) => {
            setPage(1);
            setCustomerId(e.target.value);
          }}
          placeholder="Customer ObjectId"
        />
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
        />
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
        onRowClick={(row) => setSelectedId(row._id)}
      />

      <ReturnDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
