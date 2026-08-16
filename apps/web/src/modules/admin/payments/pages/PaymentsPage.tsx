import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { PaymentListItem } from '../../../../api/admin-payments.api';
import { Badge } from '../../../../components/common/Badge';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatCurrency, formatDateTime } from '../../../../utils/format';
import { PaymentDetailDrawer } from '../components/PaymentDetailDrawer';
import { usePaymentsList } from '../hooks/useAdminPayments';

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  captured: 'green',
  pending: 'yellow',
  failed: 'red',
  refunded: 'gray',
};

const columns: ColumnDef<PaymentListItem, unknown>[] = [
  { accessorKey: 'razorpayOrderId', header: 'Razorpay Order', cell: ({ row }) => <span className="font-mono text-xs">{row.original.razorpayOrderId}</span> },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => formatCurrency(row.original.amount / 100),
  },
  { accessorKey: 'method', header: 'Method', enableSorting: false },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
        {/* Part 24 — payment captured at Razorpay but order finalization hasn't
            succeeded yet; needs manual review. Money is not lost. */}
        {row.original.reconciliationError && (
          <span title={row.original.reconciliationError}>
            <Badge tone="red">Needs reconciliation</Badge>
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
];

export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading } = usePaymentsList({
    page,
    limit,
    filter: status ? { status } : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Payments</h1>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedId(row._id)}
        toolbar={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={[
              { label: 'Pending', value: 'pending' },
              { label: 'Captured', value: 'captured' },
              { label: 'Failed', value: 'failed' },
              { label: 'Refunded', value: 'refunded' },
            ]}
          />
        }
      />

      <PaymentDetailDrawer paymentId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
