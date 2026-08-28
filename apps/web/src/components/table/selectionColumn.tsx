import type { ColumnDef } from '@tanstack/react-table';

/** Drop into any DataTable `columns` array (as the first entry) to get a checkbox selection column for free. */
export function selectionColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
        }}
        onChange={table.getToggleAllRowsSelectedHandler()}
        className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
}
