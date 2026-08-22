import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { globalSearch } from '../../../api/search.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SearchBar } from '../../../components/common/SearchBar';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { ProductCard } from '../components/ProductCard';

export default function SearchResultsPage() {
  // Seeds from `?q=` so the header's search box (Header.tsx) can navigate
  // straight to a populated results page — the query API itself
  // (`globalSearch`) is completely unchanged, this only changes where the
  // initial value comes from. Kept in sync both ways so the URL stays
  // shareable/bookmarkable as the visitor keeps typing.
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const { data, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => globalSearch(query),
    enabled: query.length > 0,
  });

  function handleQueryChange(next: string) {
    setQuery(next);
    setSearchParams(next ? { q: next } : {}, { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Search</h1>
      <SearchBar value={query} onChange={handleQueryChange} placeholder="Search medicines, categories…" />

      {!query ? (
        <p className="text-sm text-gray-500">Start typing to search the catalog.</p>
      ) : isLoading ? (
        <SkeletonRows rows={3} columns={4} />
      ) : !data || data.products.length === 0 ? (
        <EmptyState title="No results found" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
