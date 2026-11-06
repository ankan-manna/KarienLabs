import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPublicBanners } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';

/**
 * Offers are just Banner records with `placement: 'offer'` (see
 * admin → CMS → Banners, "Offer" placement option) — the same
 * Cloudinary-backed image upload, title/subtitle/badge/CTA fields, and
 * optional start/end-date scheduling every other banner placement already
 * has, rather than a separate Offer model/admin screen. Adding, editing,
 * scheduling, or removing an offer is entirely admin-panel-controlled; this
 * page only ever renders what the admin has published.
 */
export default function OffersPage() {
  const { data: offers, isLoading } = useQuery({
    queryKey: ['public-banners', 'offer'],
    queryFn: () => getPublicBanners('offer'),
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
        <SkeletonRows rows={2} columns={3} />
      ) : !offers || offers.length === 0 ? (
        <EmptyState
          title="No active offers"
          description="Check back soon — new deals are added regularly."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <Link
              key={offer._id}
              to={offer.linkUrl || '/products'}
              className="group flex flex-col overflow-hidden rounded-2xl border border-pale-sage bg-white shadow-storefront-sm transition-shadow hover:shadow-storefront-hover dark:border-night-border dark:bg-night-surface"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-50 dark:bg-night-elevated">
                <img
                  src={offer.imageUrl}
                  alt={offer.imageAlt || offer.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {offer.badge && (
                  <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    {offer.badge}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-5">
                <h2 className="font-brentis-display text-lg font-semibold text-ink dark:text-night-text">
                  {offer.title}
                </h2>
                {offer.subtitle && (
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-night-muted">
                    {offer.subtitle}
                  </p>
                )}
                <span className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-sm font-semibold text-primary">
                  {offer.ctaText || 'Shop Now'}
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
