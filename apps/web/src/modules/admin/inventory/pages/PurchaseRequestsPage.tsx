import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { PurchaseRequest } from '../../../../api/purchase-requests.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDate } from '../../../../utils/format';
import { CreatePurchaseRequestModal } from '../components/CreatePurchaseRequestModal';
import { PurchaseRequestDetailDrawer } from '../components/PurchaseRequestDetailDrawer';
import { useAdminPurchaseRequestsList } from '../hooks/useAdminPurchaseRequests';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  pending: 'blue',
  approved: 'yellow',
  rejected: 'red',
  converted: 'green',
};

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Converted', value: 'converted' },
];

const columns: ColumnDef<PurchaseRequest, unknown>[] = [
  {
    accessorKey: 'requestNumber',
    header: 'Request #',
    enableSorting: false,
  },
  {
    accessorKey: 'warehouseId',
    header: 'Warehouse',
    enableSorting: false,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.warehouseId}</span>,
  },
  {
    accessorKey: 'items',
    header: 'Items',
    enableSorting: false,
    cell: ({ row }) => row.original.items.reduce((sum, i) => sum + i.quantity, 0),
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

export default function PurchaseRequestsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const limit = 20;

  const { data, isLoading } = useAdminPurchaseRequestsList({
    page,
    limit,
    sort,
    filter: status ? { status } : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Purchase Requests
        </h1>
        <Can I="create" a="purchase_orders">
          <Button onClick={() => setIsCreateOpen(true)}>New Purchase Request</Button>
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
        onRowClick={(row) => setSelectedId(row._id)}
        toolbar={
          <div className="w-48">
            <Select
              placeholder="All statuses"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      />

      <PurchaseRequestDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      <CreatePurchaseRequestModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
