import { useState } from 'react';

import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface BulkActionsBarProps {
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onDelete: (ids: string[]) => Promise<unknown>;
  /** Set when the entity has an `isActive` field — renders Activate/Deactivate as bulk-edit shortcuts. */
  onSetActive?: (ids: string[], isActive: boolean) => Promise<unknown>;
  isDeleting?: boolean;
  isUpdating?: boolean;
}

/** Bulk Edit (activate/deactivate) + Bulk Delete — the two bulk actions every "Standard CRUD Design" list page needs, dropped into `DataTable`'s `bulkActions` slot. */
export function BulkActionsBar({
  selectedIds,
  onClearSelection,
  onDelete,
  onSetActive,
  isDeleting,
  isUpdating,
}: BulkActionsBarProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ids = Array.from(selectedIds);

  return (
    <>
      <div className="flex items-center gap-2">
        {onSetActive && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={isUpdating}
              onClick={async () => {
                await onSetActive(ids, true);
                onClearSelection();
              }}
            >
              Activate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              isLoading={isUpdating}
              onClick={async () => {
                await onSetActive(ids, false);
                onClearSelection();
              }}
            >
              Deactivate
            </Button>
          </>
        )}
        <Button type="button" size="sm" variant="danger" onClick={() => setConfirmingDelete(true)}>
          Delete
        </Button>
      </div>

      <ConfirmDialog
        isOpen={confirmingDelete}
        title="Delete selected records"
        message={`Delete ${ids.length} record(s)? This can't be undone.`}
        confirmLabel="Delete"
        isDangerous
        isLoading={isDeleting}
        onConfirm={async () => {
          await onDelete(ids);
          setConfirmingDelete(false);
          onClearSelection();
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
