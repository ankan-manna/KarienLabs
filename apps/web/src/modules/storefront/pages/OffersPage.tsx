import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPublicBanners } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';

export default function OffersPage() {
  const { data: banners, isLoading } = useQuery({
    queryKey: ['public-banners', 'category'],
    queryFn: () => getPublicBanners('category'),
  });

  useDocumentMeta({
    title: 'Offers & Deals',
    description: 'Current discounts and promotions on medicines and health products.',
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Offers & Deals
      </h1>
      {isLoading ? (
        <SkeletonRows rows={2} columns={2} />
      ) : !banners || banners.length === 0 ? (
        <EmptyState
          title="No active offers"
          description="Check back soon — new deals are added regularly."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {banners.map((banner) => (
            <Link
              key={banner._id}
              to={banner.linkUrl || '/products'}
              className="block overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800"
            >
              <img src={banner.imageUrl} alt={banner.title} className="w-full object-cover" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
