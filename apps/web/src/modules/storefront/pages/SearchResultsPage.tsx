import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { searchProducts } from '../../../api/search.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { Pagination } from '../../../components/common/Pagination';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { ProductCard } from '../components/ProductCard';

const LIMIT = 20;

/**
 * Fixed two real bugs this page had:
 * 1. It called `globalSearch` (the small, capped-at-10, non-paginated "did
 *    you mean" cross-collection surface meant for a compact suggestions
 *    dropdown) instead of `searchProducts` (`/search/products` — the real
 *    paginated, filtered, sorted product search). A search matching more
 *    than 10 products silently truncated with no pagination or count.
 * 2. It rendered its OWN editable `SearchBar` in addition to the navbar's
 *    — two separate, independently-editable search inputs on the same
 *    page, which is exactly the "confusing duplicate search box" this
 *     calls out. The navbar search is now the one, single source of
 *    truth (live debounce, autocomplete, clear button, Enter-to-submit);
 *    this page just reads `?q=` and shows it as a label, matching the
 *    "Search for 'x' / N products found" pattern.
 */
export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [page, setPage] = useState(1);

  // A new query navigated in from the navbar (new `?q=`) always restarts at
  // page 1 rather than preserving whatever page a previous search left off
  // on — prevents a jarring "page 4 of 1" empty state.
  useEffect(() => setPage(1), [query]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search-products', query, page],
    queryFn: ({ signal }) => searchProducts({ q: query, page, limit: LIMIT }, signal),
    enabled: query.length > 0,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink dark:text-night-text">
        {query ? (
          <>
            Search results for <span className="text-primary">&quot;{query}&quot;</span>
          </>
        ) : (
          'Search'
        )}
      </h1>

      {!query ? (
        <p className="text-sm text-gray-500 dark:text-night-muted">Start typing to search the catalog.</p>
      ) : isLoading ? (
        <SkeletonRows rows={3} columns={4} />
      ) : isError ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't complete your search. Please try again."
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={`No products found for "${query}"`}
          description="Try another product name, brand, SKU or category."
        />
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-night-muted">
            <span className="font-medium text-ink dark:text-night-text">{data.meta.total}</span>{' '}
            {data.meta.total === 1 ? 'product' : 'products'} found
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
          <Pagination page={page} limit={LIMIT} total={data.meta.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
