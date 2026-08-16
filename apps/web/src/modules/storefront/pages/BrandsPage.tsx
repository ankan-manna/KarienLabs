import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { brandApi } from '../../../api/catalog.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';

export default function BrandsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['brands', 'public', 'browse'],
    queryFn: () => brandApi.list({ limit: 100, sort: 'name' }),
  });

  useDocumentMeta({
    title: 'Shop by Brand',
    description: 'Browse medicines and health products by trusted brand.',
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Shop by Brand
      </h1>
      {isLoading ? (
        <SkeletonRows rows={2} columns={4} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No brands yet" description="Check back soon." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((brand) => (
            <Link
              key={brand._id}
              to={`/products?brandId=${brand._id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 bg-white p-4 text-center hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="h-12 w-12 object-contain" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-lg dark:bg-brand-500/10">
                  🏷️
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {brand.name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
