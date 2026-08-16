import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { Prescription } from '../../../../api/prescriptions.api';
import { Badge } from '../../../../components/common/Badge';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDateTime } from '../../../../utils/format';
import { PrescriptionDetailDrawer } from '../components/PrescriptionDetailDrawer';
import { useAdminPrescriptionsList } from '../hooks/useAdminPrescriptions';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  expired: 'gray',
  cancelled: 'gray',
};

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
];

const columns: ColumnDef<Prescription, unknown>[] = [
  {
    accessorKey: '_id',
    header: 'ID',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original._id.slice(-8)}</span>,
  },
  {
    accessorKey: 'userId',
    header: 'Customer',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId.slice(-8)}</span>,
  },
  {
    accessorKey: 'orderId',
    header: 'Order',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.orderId ? row.original.orderId.slice(-8) : '—'}</span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Uploaded',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>,
  },
];

export default function AdminPrescriptionsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 20;

  const filter: Record<string, string> = {};
  if (status) filter.status = status;
  if (customerId.trim()) filter.userId = customerId.trim();
  if (orderId.trim()) filter.orderId = orderId.trim();
  if (dateFrom) filter.dateFrom = dateFrom;
  if (dateTo) filter.dateTo = dateTo;

  const { data, isLoading } = useAdminPrescriptionsList({ page, limit, sort, filter });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Prescriptions</h1>

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
          label="Order ID"
          value={orderId}
          onChange={(e) => {
            setPage(1);
            setOrderId(e.target.value);
          }}
          placeholder="Order ObjectId"
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

      <PrescriptionDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
