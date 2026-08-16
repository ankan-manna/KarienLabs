import { useEffect, useState } from 'react';

import { Button } from '../common/Button';

interface SavedFilter {
  name: string;
  search: string;
}

interface SavedFiltersProps {
  /** localStorage key namespace — one per page, e.g. "products-saved-filters". */
  storageKey: string;
  currentSearch: string;
  onApply: (search: string) => void;
}

/** Lightweight "Saved Filters" — names the current search term and re-applies it later. Stored client-side (localStorage), no backend model needed for this scope. */
export function SavedFilters({ storageKey, currentSearch, onApply }: SavedFiltersProps) {
  const [filters, setFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setFilters(JSON.parse(raw));
      } catch {
        setFilters([]);
      }
    }
  }, [storageKey]);

  function persist(next: SavedFilter[]) {
    setFilters(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function saveCurrent() {
    if (!currentSearch.trim()) return;
    const name = window.prompt('Name this filter', currentSearch);
    if (!name) return;
    persist([...filters.filter((f) => f.name !== name), { name, search: currentSearch }]);
  }

  function remove(name: string) {
    persist(filters.filter((f) => f.name !== name));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <span
          key={f.name}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <button type="button" onClick={() => onApply(f.search)} className="hover:underline">
            {f.name}
          </button>
          <button
            type="button"
            onClick={() => remove(f.name)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label={`Remove saved filter ${f.name}`}
          >
            ×
          </button>
        </span>
      ))}
      {currentSearch.trim() && (
        <Button type="button" size="sm" variant="ghost" onClick={saveCurrent}>
          + Save filter
        </Button>
      )}
    </div>
  );
}
