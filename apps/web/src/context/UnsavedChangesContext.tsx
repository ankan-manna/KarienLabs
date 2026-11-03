import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { UnsavedChangesDialog } from '../components/common/UnsavedChangesDialog';

/**
 * A page/form registers itself here with its current dirty state and the
 * real Save/Discard behavior for whatever it is — there is no separate
 * "unsaved changes" save path; `onSave` must be the same submit the form
 * would run on a normal manual submit (validation included), and reject/
 * throw on failure so the dialog can keep the user on the form with every
 * entered value intact. `onDiscard` only needs to reset local state — no
 * network call.
 */
export interface UnsavedChangesGuard {
  isDirty: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
}

interface DialogState {
  open: boolean;
  guard: UnsavedChangesGuard | null;
  pendingNavigate: (() => void) | null;
  isSaving: boolean;
  saveError: string | null;
}

interface UnsavedChangesContextValue {
  /** Ref, not state — written on every render by the hook below; read only
   * at click-time, so a dirty flag changing on every keystroke never
   * re-renders anything outside the form itself. */
  guardRef: React.MutableRefObject<UnsavedChangesGuard | null>;
  /** Called by anything that can navigate away from the whole app shell
   * (logo links today). Navigates immediately with zero overhead when
   * nothing is dirty; opens the confirmation dialog otherwise. */
  requestNavigation: (navigate: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('useUnsavedChangesContext must be used within UnsavedChangesProvider');
  return ctx;
}

/**
 * Registers the calling form's live dirty state + real save/discard
 * handlers with the app-wide guard. Pass `null` (or an object with
 * `isDirty: false`) when there's nothing to protect — most pages never
 * call this at all, which is the common case and costs nothing.
 */
export function useUnsavedChangesGuard(guard: UnsavedChangesGuard | null) {
  const { guardRef } = useUnsavedChangesContext();
  // A plain ref write during render (not in an effect) is intentional here:
  // this is the standard "always-latest-value" ref pattern — the ref is
  // only ever read later, at click time, never used to produce this
  // component's own render output, so there's no tearing/staleness risk,
  // and it avoids an effect that would otherwise re-run on every keystroke
  // (onSave/onDiscard are fresh closures every render).
  guardRef.current = guard;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<UnsavedChangesGuard | null>(null);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    guard: null,
    pendingNavigate: null,
    isSaving: false,
    saveError: null,
  });

  const requestNavigation = (navigate: () => void) => {
    const guard = guardRef.current;
    if (guard?.isDirty) {
      setDialog({ open: true, guard, pendingNavigate: navigate, isSaving: false, saveError: null });
    } else {
      navigate();
    }
  };

  const closeDialog = () => setDialog({ open: false, guard: null, pendingNavigate: null, isSaving: false, saveError: null });

  const handleSave = async () => {
    if (!dialog.guard || !dialog.pendingNavigate) return;
    setDialog((d) => ({ ...d, isSaving: true, saveError: null }));
    try {
      await dialog.guard.onSave();
      const navigate = dialog.pendingNavigate;
      closeDialog();
      navigate();
    } catch (err) {
      // Validation or API failure: stay on the form, preserve every entered
      // value (the form's own state is untouched by any of this), surface
      // the error, never navigate.
      setDialog((d) => ({
        ...d,
        isSaving: false,
        saveError: err instanceof Error ? err.message : 'Could not save your changes. Please try again.',
      }));
    }
  };

  const handleDiscard = () => {
    dialog.guard?.onDiscard();
    const navigate = dialog.pendingNavigate;
    closeDialog();
    navigate?.();
  };

  // Browser-native refresh/close/tab-navigation protection. Zero
  // interference with normal in-app navigation — this only ever fires on a
  // genuine document unload attempt, and the browser shows its own built-in
  // confirmation (custom message text has not been permitted by any
  // browser for years; `returnValue` just has to be a non-empty string to
  // trigger the native prompt).
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (guardRef.current?.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const value = useMemo<UnsavedChangesContextValue>(() => ({ guardRef, requestNavigation }), []);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      {dialog.open && (
        <UnsavedChangesDialogRenderer
          isSaving={dialog.isSaving}
          saveError={dialog.saveError}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onCancel={closeDialog}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

// Rendered lazily (only mounted while `dialog.open`) so the Modal/portal
// machinery never exists in the DOM when there's nothing to confirm.
function UnsavedChangesDialogRenderer(props: {
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return <UnsavedChangesDialog isOpen {...props} />;
}
