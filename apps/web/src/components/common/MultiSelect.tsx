import { useEffect, useRef, useState } from 'react';

import { cn } from '../../utils/cn';

export interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectProps {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Controlled search text — pass together with `onSearchChange` to drive a server-side search (e.g. product name lookup). Omit both for local label filtering over `options`. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

/**
 * Search-as-you-type checkbox picker with selected items shown as removable
 * chips. Selected labels are cached across searches so a chip still reads
 * correctly after its option scrolls out of the current (filtered) list.
 */
export function MultiSelect({
  label,
  error,
  hint,
  placeholder = 'Search…',
  options,
  value,
  onChange,
  searchValue,
  onSearchChange,
  isLoading,
  disabled,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const labelCache = useRef(new Map<string, string>());

  const isServerSearch = onSearchChange !== undefined;
  const search = isServerSearch ? (searchValue ?? '') : localSearch;

  for (const opt of options) labelCache.current.set(opt.value, opt.label);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const visibleOptions = isServerSearch
    ? options
    : options.filter((opt) => opt.label.toLowerCase().includes(localSearch.toLowerCase()));

  function toggle(optValue: string) {
    onChange(value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue]);
  }

  function remove(optValue: string) {
    onChange(value.filter((v) => v !== optValue));
  }

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      )}
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setIsOpen(true);
            if (isServerSearch) onSearchChange?.(e.target.value);
            else setLocalSearch(e.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
            'text-gray-900 placeholder:text-gray-400 dark:bg-gray-900 dark:text-gray-100',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            error ? 'border-red-400' : 'border-gray-300 dark:border-gray-700',
            disabled && 'cursor-not-allowed opacity-60',
          )}
          aria-invalid={!!error}
        />
        {isOpen && !disabled && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {isLoading ? (
              <p className="px-3 py-2 text-xs text-gray-400">Loading…</p>
            ) : visibleOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            ) : (
              visibleOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600"
                    checked={value.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                  />
                  <span className="text-gray-900 dark:text-gray-100">{opt.label}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
            >
              {labelCache.current.get(v) ?? v}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(v)}
                aria-label={`Remove ${labelCache.current.get(v) ?? v}`}
                className="text-brand-500 hover:text-brand-700 dark:text-brand-400"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
