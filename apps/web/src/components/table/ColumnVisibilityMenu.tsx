import type { Table } from '@tanstack/react-table';
import { useState } from 'react';

import { cn } from '../../utils/cn';

export function ColumnVisibilityMenu<T>({ table }: { table: Table<T> }) {
  const [open, setOpen] = useState(false);
  const columns = table.getAllLeafColumns().filter((col) => col.getCanHide());

  if (columns.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-night-border dark:text-night-muted dark:hover:bg-night-elevated"
      >
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg',
              'dark:border-night-border dark:bg-night-surface',
            )}
          >
            {columns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-night-text dark:hover:bg-night-elevated"
              >
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
