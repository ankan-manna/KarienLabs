import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import {
  listNotificationHistory,
  retryNotification,
  type NotificationHistoryEntry,
} from '../../../../api/notifications-admin.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDateTime } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  sent: 'green',
  queued: 'yellow',
  failed: 'red',
  cancelled: 'gray',
};

function RetryCell({ row }: { row: NotificationHistoryEntry }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retryNotification(row._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-history'] });
      toast.success('Notification retry queued');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (row.status !== 'failed') return null;

  return (
    <Can I="update" a="notifications">
      <Button
        size="sm"
        variant="outline"
        isLoading={mutation.isPending}
        onClick={(e) => {
          e.stopPropagation();
          mutation.mutate();
        }}
      >
        Retry
      </Button>
    </Can>
  );
}

const columns: ColumnDef<NotificationHistoryEntry, unknown>[] = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'templateKey', header: 'Template' },
  { accessorKey: 'recipient', header: 'Recipient' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
    ),
  },
  {
    id: 'errorCode',
    header: 'Failure reason',
    cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.errorCode || '—'}</span>,
  },
  {
    accessorKey: 'sentAt',
    header: 'Sent At',
    cell: ({ row }) => formatDateTime(row.original.sentAt),
  },
  {
    id: 'retry',
    header: '',
    enableSorting: false,
    cell: ({ row }) => <RetryCell row={row.original} />,
  },
];

export default function NotificationHistoryPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['notification-history', page],
    queryFn: () => listNotificationHistory({ page, limit }),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Notification History
      </h1>
      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
      />
    </div>
  );
}
