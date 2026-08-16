import { useQueries } from '@tanstack/react-query';

import { getProduct } from '../../../api/products-public.api';
import { useRecentlyViewed } from '../../../hooks/useRecentlyViewed';

import { ProductCard } from './ProductCard';

/** Renders nothing until the visitor has actually viewed at least one product this session/browser. */
export function RecentlyViewedProducts({ excludeId }: { excludeId?: string }) {
  const { ids } = useRecentlyViewed();
  const relevantIds = ids.filter((id) => id !== excludeId).slice(0, 8);

  const results = useQueries({
    queries: relevantIds.map((id) => ({
      queryKey: ['products', 'detail', id],
      queryFn: () => getProduct(id),
      staleTime: 60_000,
    })),
  });

  const products = results.map((r) => r.data).filter((p): p is NonNullable<typeof p> => !!p);
  if (products.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Recently Viewed
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}
