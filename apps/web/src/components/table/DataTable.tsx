import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';

import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';
import { SkeletonRows } from '../common/Skeleton';

import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  totalCount: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  enableRowSelection?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  bulkActions?: ReactNode;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * One reusable table for every admin/super-admin list page. Sorting and
 * pagination are server-side by design (`manualSorting`/`manualPagination`) —
 * callers own the query params and refetch, this component only renders state
 * and emits change events. Row selection is keyed by `getRowId`, not TanStack's
 * index-based default, so it survives a page's data being refetched/reordered.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  totalCount,
  page,
  limit,
  onPageChange,
  sort,
  onSortChange,
  isLoading,
  onRowClick,
  enableRowSelection = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  toolbar,
  emptyTitle = 'No records found',
  emptyDescription,
}: DataTableProps<T>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const rowSelection: RowSelectionState = useMemo(() => {
    if (!selectedIds) return {};
    return Object.fromEntries(data.map((row) => [getRowId(row), selectedIds.has(getRowId(row))]));
  }, [data, selectedIds, getRowId]);

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updater) => {
    if (!onSelectionChange) return;
    const next = typeof updater === 'function' ? updater(rowSelection) : updater;
    onSelectionChange(new Set(Object.keys(next).filter((id) => next[id])));
  };

  const sorting: SortingState = sort
    ? [{ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }]
    : [];

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { columnVisibility, rowSelection, sorting },
    manualSorting: true,
    manualPagination: true,
    enableRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: handleRowSelectionChange,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      onSortChange?.(first ? `${first.desc ? '-' : ''}${first.id}` : '');
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedCount = selectedIds?.size ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1">{toolbar}</div>
        <ColumnVisibilityMenu table={table} />
      </div>

      {selectedCount > 0 && bulkActions && (
        <div className="flex items-center gap-3 rounded-md bg-brand-50 px-3 py-2 text-sm dark:bg-brand-500/10">
          <span className="font-medium text-brand-700 dark:text-brand-400">
            {selectedCount} selected
          </span>
          {bulkActions}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-night-surface">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.columnDef.enableSorting !== false && !!onSortChange;
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap border-b border-gray-200 px-4 py-2.5 font-medium text-gray-600 dark:border-night-border dark:text-night-muted"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!canSort}
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 disabled:cursor-default"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-gray-400">
                              {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-4">
                  <SkeletonRows columns={columns.length} />
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-night-border/60 dark:hover:bg-night-elevated/40"
                  style={{ cursor: onRowClick ? 'pointer' : undefined }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5 text-gray-700 dark:text-night-text">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} limit={limit} total={totalCount} onPageChange={onPageChange} />
    </div>
  );
}
