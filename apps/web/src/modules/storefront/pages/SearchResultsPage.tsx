import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { globalSearch } from '../../../api/search.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SearchBar } from '../../../components/common/SearchBar';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { ProductCard } from '../components/ProductCard';

export default function SearchResultsPage() {
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => globalSearch(query),
    enabled: query.length > 0,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Search</h1>
      <SearchBar value={query} onChange={setQuery} placeholder="Search medicines, categories…" />

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
