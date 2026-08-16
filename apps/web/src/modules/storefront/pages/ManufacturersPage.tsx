import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { manufacturerApi } from '../../../api/catalog.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';

export default function ManufacturersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['manufacturers', 'public', 'browse'],
    queryFn: () => manufacturerApi.list({ limit: 100, sort: 'name' }),
  });

  useDocumentMeta({
    title: 'Shop by Manufacturer',
    description: 'Browse medicines by verified pharmaceutical manufacturer.',
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Shop by Manufacturer
      </h1>
      {isLoading ? (
        <SkeletonRows rows={2} columns={4} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No manufacturers yet" description="Check back soon." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.items.map((manufacturer) => (
            <Link
              key={manufacturer._id}
              to={`/products?manufacturerId=${manufacturer._id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 bg-white p-4 text-center hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-lg dark:bg-brand-500/10">
                🏭
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {manufacturer.name}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
