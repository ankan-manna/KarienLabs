import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPublicBanners } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
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
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Offers' }]} />
      <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
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
              className="group block overflow-hidden rounded-xl border border-pale-sage shadow-storefront-sm transition-shadow hover:shadow-storefront-hover dark:border-night-border"
            >
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
