import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import type { AuditLogEntry } from '../../../api/admin.api';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  listAuditLogs,
  type AuditLogFilters,
} from '../../../api/audit-center.api';
import { Badge } from '../../../components/common/Badge';
import { Input } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { DataTable } from '../../../components/table/DataTable';
import { formatDateTime } from '../../../utils/format';

const ACTION_TONES: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'gray',
  logout: 'gray',
  config_change: 'yellow',
  export: 'blue',
  import: 'blue',
  login_attempt: 'gray',
  login_success: 'green',
  login_failed: 'red',
  otp_generated: 'gray',
  otp_verified: 'green',
  otp_failed: 'red',
  otp_expired: 'red',
  otp_resend: 'yellow',
  password_reset_requested: 'gray',
  password_reset_success: 'green',
  password_reset_failed: 'red',
  google_login_success: 'green',
  google_login_failed: 'red',
  token_refresh: 'gray',
  session_revoked: 'yellow',
  account_locked: 'red',
  account_unlocked: 'green',
};

function actorLabel(entry: AuditLogEntry): string {
  const { actorId } = entry;
  if (!actorId) {
    // SYSTEM/WEBHOOK/BACKGROUND_JOB rows carry no User doc at all — fall back
    // to the actor-context type (Prompt 10 Part 4/5) when present.
    return entry.actorType ? entry.actorType.replace(/_/g, ' ') : 'System';
  }
  if (typeof actorId === 'string') return entry.actorName || actorId;
  return actorId.name ?? actorId.email ?? actorId._id;
}

function DiffCell({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasDiff = entry.before != null || entry.after != null;
  if (!hasDiff) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div>
      <button
        type="button"
        className="text-xs font-medium text-brand-600 hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Show'}
      </button>
      {open && (
        <div className="mt-1 grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
          {entry.before != null && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Before</div>
              <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-night-elevated/50">
                {JSON.stringify(entry.before, null, 2)}
              </pre>
            </div>
          )}
          {entry.after != null && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-night-muted">After</div>
              <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-night-elevated/50">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const columns: ColumnDef<AuditLogEntry, unknown>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Timestamp',
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: 'actorId',
    header: 'Actor',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{actorLabel(row.original)}</span>
        {row.original.actorType && (
          <span className="text-xs text-gray-400">{row.original.actorType}</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={ACTION_TONES[row.original.action] ?? 'gray'}>{row.original.action}</Badge>
    ),
  },
  {
    id: 'authenticationMethod',
    header: 'Authentication',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.authenticationMethod ? (
        <span className="text-xs">{row.original.authenticationMethod}</span>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      ),
  },
  {
    id: 'result',
    header: 'Result',
    enableSorting: false,
    cell: ({ row }) => {
      const { result, failureReason } = row.original;
      if (!result) return <span className="text-xs text-gray-400">—</span>;
      return (
        <div className="flex flex-col">
          <Badge tone={result === 'success' ? 'green' : 'red'}>{result}</Badge>
          {failureReason && (
            <span className="mt-0.5 text-xs text-gray-400">{failureReason.replace(/_/g, ' ')}</span>
          )}
        </div>
      );
    },
  },
  { accessorKey: 'resource', header: 'Resource', enableSorting: false },
  {
    accessorKey: 'resourceId',
    header: 'Resource ID',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.resourceId?.slice(-8) ?? '—'}</span>
    ),
  },
  {
    id: 'requestId',
    header: 'Request ID',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.requestId ? (
        <span className="font-mono text-xs" title={row.original.requestId}>
          {row.original.requestId.slice(0, 8)}
        </span>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      ),
  },
  {
    id: 'diff',
    header: 'Changes',
    enableSorting: false,
    cell: ({ row }) => <DiffCell entry={row.original} />,
  },
];

export default function AuditCenterPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-center', page, filters],
    queryFn: () => listAuditLogs({ page, limit, filters }),
    placeholderData: (prev) => prev,
  });

  function updateFilter(patch: Partial<AuditLogFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">Audit Center</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Select
          label="Resource"
          value={filters.resource ?? ''}
          onChange={(e) => updateFilter({ resource: e.target.value || undefined })}
          options={[
            { label: 'All resources', value: '' },
            ...AUDIT_RESOURCES.map((r) => ({ label: r, value: r })),
          ]}
        />
        <Select
          label="Action"
          value={filters.action ?? ''}
          onChange={(e) => updateFilter({ action: e.target.value || undefined })}
          options={[
            { label: 'All actions', value: '' },
            ...AUDIT_ACTIONS.map((a) => ({ label: a, value: a })),
          ]}
        />
        <Input
          label="From"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => updateFilter({ from: e.target.value || undefined })}
        />
        <Input
          label="To"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => updateFilter({ to: e.target.value || undefined })}
        />
        <Input
          label="Actor ID"
          placeholder="user id"
          value={filters.actorId ?? ''}
          onChange={(e) => updateFilter({ actorId: e.target.value || undefined })}
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
        isLoading={isLoading}
      />
    </div>
  );
}
