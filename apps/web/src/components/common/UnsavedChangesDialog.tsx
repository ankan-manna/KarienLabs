import { Button } from './Button';
import { Modal } from './Modal';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * The one, shared confirmation dialog for leaving a dirty form — rendered
 * once by `UnsavedChangesProvider`, never instantiated per-form. Copy is
 * exact, per docs/BRENTIS_UNSAVED_NAVIGATION_SPEC.md.
 */
export function UnsavedChangesDialog({
  isOpen,
  isSaving,
  saveError,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onCancel}
      title="You have unsaved changes"
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onDiscard} disabled={isSaving}>
            Discard Changes
          </Button>
          <Button variant="primary" onClick={onSave} isLoading={isSaving}>
            Save Changes
          </Button>
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-night-muted">
        You have unsaved changes on this page. What would you like to do?
      </p>
      {saveError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {saveError}
        </p>
      )}
    </Modal>
  );
}
