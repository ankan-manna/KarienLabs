import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { fetchEntityActivityLog, fetchEntityAuditLog, type AuditLogEntry } from '../../api/admin.api';
import { formatDateTime } from '../../utils/format';

import { Badge } from './Badge';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Tabs } from './Tabs';

const ACTION_TONES: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'gray',
  logout: 'gray',
  config_change: 'yellow',
};

function actorLabel(actorId: AuditLogEntry['actorId']): string {
  if (!actorId) return 'System';
  if (typeof actorId === 'string') return actorId;
  return actorId.name ?? actorId.email ?? actorId._id;
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [showDiff, setShowDiff] = useState(false);
  const hasDiff = entry.before != null || entry.after != null;

  return (
    <li className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-700">
      <div className="flex items-center gap-2">
        <Badge tone={ACTION_TONES[entry.action] ?? 'gray'}>{entry.action}</Badge>
        <span className="text-xs text-gray-500 dark:text-gray-400">{actorLabel(entry.actorId)}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(entry.createdAt)}</div>
      {hasDiff && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline"
            onClick={() => setShowDiff((v) => !v)}
          >
            {showDiff ? 'Hide changes' : 'Show changes'}
          </button>
          {showDiff && (
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {entry.before != null && (
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Before</div>
                  <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-800/50">
                    {JSON.stringify(entry.before, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after != null && (
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">After</div>
                  <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-800/50">
                    {JSON.stringify(entry.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

interface MetaInfo {
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface EntityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Permission-resource key AND the audit/activity-log `resource` field value — same string on this codebase (see RESOURCES constants). */
  resource: string;
  resourceId: string | null;
  general: ReactNode;
  related?: ReactNode;
  /** Optional "Preview" tab (e.g. rendered template subject/body) — only rendered once an existing record is open (never for "New"), same convention as `related`. Purely additive. */
  preview?: ReactNode;
  meta?: MetaInfo;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
}

function AuditHistoryTab({ resource, resourceId }: { resource: string; resourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', resource, resourceId],
    queryFn: () => fetchEntityAuditLog(resource, resourceId),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.items.length) return <EmptyState title="No audit history yet" />;

  return (
    <ul className="flex flex-col gap-3">
      {data.items.map((entry) => (
        <AuditLogRow key={entry._id} entry={entry} />
      ))}
    </ul>
  );
}

function ActivityTimelineTab({ resource, resourceId }: { resource: string; resourceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', resource, resourceId],
    queryFn: () => fetchEntityActivityLog(resource, resourceId),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.items.length) return <EmptyState title="No activity recorded yet" />;

  return (
    <ul className="flex flex-col gap-3">
      {data.items.map((entry) => (
        <li key={entry._id} className="border-l-2 border-brand-200 pl-3 text-sm dark:border-brand-800">
          <div className="text-gray-800 dark:text-gray-200">{entry.message}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(entry.createdAt)}</div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Right-side detail drawer every "Row Click Behavior" spec entity gets: General
 * Information / Related Information / Activity Timeline / Audit History tabs, plus
 * Edit/Delete/Duplicate/Print/Download-PDF actions (each optional — only entities
 * that support the action pass the handler). One component, reused across Products,
 * Orders, Customers, Payments, etc. instead of a bespoke drawer per module.
 */
export function EntityDrawer({
  isOpen,
  onClose,
  title,
  resource,
  resourceId,
  general,
  related,
  preview,
  meta,
  onEdit,
  onDelete,
  onDuplicate,
  onPrint,
  onDownloadPdf,
}: EntityDrawerProps) {
  const [tab, setTab] = useState('general');

  const tabs = [
    { key: 'general', label: 'General', content: general },
    ...(related ? [{ key: 'related', label: 'Related', content: related }] : []),
    ...(preview ? [{ key: 'preview', label: 'Preview', content: preview }] : []),
    ...(resourceId
      ? [
          {
            key: 'activity',
            label: 'Activity Timeline',
            content: <ActivityTimelineTab resource={resource} resourceId={resourceId} />,
          },
          {
            key: 'audit',
            label: 'Audit History',
            content: <AuditHistoryTab resource={resource} resourceId={resourceId} />,
          },
        ]
      : []),
  ];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} width="lg">
      <div className="flex flex-col gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {meta && (meta.createdAt || meta.updatedAt) && (
          <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            {meta.createdAt && <div>Created {formatDateTime(meta.createdAt)}</div>}
            {meta.updatedAt && <div>Updated {formatDateTime(meta.updatedAt)}</div>}
            {meta.createdBy && <div>By {meta.createdBy}</div>}
            {meta.updatedBy && <div>By {meta.updatedBy}</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          {onEdit && (
            <Button type="button" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {onDuplicate && (
            <Button type="button" size="sm" variant="outline" onClick={onDuplicate}>
              Duplicate
            </Button>
          )}
          {onPrint && (
            <Button type="button" size="sm" variant="outline" onClick={onPrint}>
              Print
            </Button>
          )}
          {onDownloadPdf && (
            <Button type="button" size="sm" variant="outline" onClick={onDownloadPdf}>
              Download PDF
            </Button>
          )}
          {onDelete && (
            <Button type="button" size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
}
