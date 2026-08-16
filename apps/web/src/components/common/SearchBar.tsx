import { useEffect, useState } from 'react';

import { useDebounce } from '../../hooks/useDebounce';

import { Input } from './Input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/** Debounces locally, then propagates — callers can wire `onChange` straight into a query param without re-implementing debounce logic per page. */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search…',
  debounceMs = 300,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounced = useDebounce(localValue, debounceMs);

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <Input
      type="search"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      placeholder={placeholder}
      aria-label="Search"
    />
  );
}
