import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { brandApi } from '../../../api/catalog.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import { getPublicBanners, getPublicHomeSections, listPublicBlogs } from '../../../api/public-cms.api';
import { listRecentTopReviews } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { RatingStars } from '../../../components/common/RatingStars';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackViewItemList } from '../../../lib/analytics';
import { formatDate } from '../../../utils/format';
import { HeroCarousel } from '../components/HeroCarousel';
import { ProductCard } from '../components/ProductCard';
import { RecentlyViewedProducts } from '../components/RecentlyViewedProducts';

/**
 * Website Design (Storefront Management) Part 3/4/7 — every ACTIVE
 * `placement: 'hero'` banner (not just `banners[0]`) drives an
 * auto-advancing carousel; the Super Admin controls all of it — image,
 * title, subtitle, CTA text/link, order, active window — from the admin
 * "Website Design" section, nothing here is hardcoded. Falls back to a
 * static, still fully-templated hero (no banner data to be dynamic about)
 * only when zero hero banners are configured, so the homepage never breaks.
 */
function HeroBanner() {
  const { data: banners } = useQuery({
    queryKey: ['public-banners', 'hero'],
    queryFn: () => getPublicBanners('hero'),
  });

  if (banners && banners.length > 0) {
    return <HeroCarousel banners={banners} />;
  }

  return (
    <section className="relative overflow-hidden rounded-2xl bg-soft-mint dark:bg-gray-900">
      {/* Decorative, purely-visual background shapes — no images to fetch, no layout shift. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-healthcare-teal/10 sm:h-80 sm:w-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 right-10 h-48 w-48 rounded-full bg-coral/10"
      />
      <div className="relative grid grid-cols-1 items-center gap-8 px-6 py-12 sm:px-10 sm:py-16 md:grid-cols-2 md:py-20">
        <div className="max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-healthcare-teal dark:bg-gray-800 dark:text-emerald-300">
            ✓ Verified pharmacy partners
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-charcoal-teal dark:text-gray-100 sm:text-4xl lg:text-5xl">
            Your health, delivered with care.
          </h1>
          <p className="mt-4 max-w-md text-base text-slate-teal dark:text-gray-300">
            Genuine medicines and healthcare essentials, ordered in minutes and delivered fast —
            with GST invoices and secure payments on every order.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/products">
              <Button variant="coral" size="lg">
                Shop medicines
              </Button>
            </Link>
            <Link to="/bulk-purchase">
              <Button variant="teal" size="lg">
                Bulk purchase
              </Button>
            </Link>
          </div>
        </div>
        {/* Healthcare visual — an SVG illustration (no external asset dependency, no CLS) rather than a placeholder photo. */}
        <div className="hidden justify-self-end md:block">
          <svg
            viewBox="0 0 240 220"
            className="h-56 w-56 text-deep-teal/80 lg:h-64 lg:w-64"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="120" cy="110" r="100" className="fill-healthcare-teal/10" />
            <rect x="70" y="60" width="100" height="120" rx="12" className="fill-white" />
            <rect x="86" y="80" width="68" height="10" rx="5" className="fill-healthcare-teal" />
            <rect x="86" y="100" width="48" height="8" rx="4" className="fill-pale-sage" />
            <rect x="86" y="116" width="56" height="8" rx="4" className="fill-pale-sage" />
            <circle cx="150" cy="150" r="26" className="fill-coral" />
            <path
              d="M150 138v24M138 150h24"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}

// A category with no admin-configured `imageUrl` still needs to look
// distinct from its neighbors (Part 1's explicit complaint: "do not use
// repeated generic capsule emojis") — deterministic per category id, so the
// same category always gets the same icon rather than a random one on
// every render, and no fake image data is invented.
const CATEGORY_ICONS = ['💊', '🩺', '🧴', '🍼', '🩹', '🧪', '👶', '🦷', '💉', '🧻', '🌡️', '🧬'];
function iconForCategory(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CATEGORY_ICONS[hash % CATEGORY_ICONS.length];
}

function CategoryTile({ cat }: { cat: { _id: string; name: string; imageUrl?: string } }) {
  return (
    <Link
      to={`/products?categoryId=${cat._id}`}
      className="group flex min-w-[112px] flex-col items-center gap-2 rounded-xl border border-pale-sage bg-white p-4 text-center transition-all hover:-translate-y-0.5 hover:border-healthcare-teal hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-soft-mint text-2xl transition-colors group-hover:bg-pale-sage dark:bg-healthcare-teal/10 dark:group-hover:bg-healthcare-teal/20">
        {cat.imageUrl ? (
          <img src={cat.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{iconForCategory(cat._id)}</span>
        )}
      </div>
      <span className="line-clamp-2 text-xs font-medium text-gray-700 dark:text-gray-200">
        {cat.name}
      </span>
    </Link>
  );
}

function CategorySlider() {
  const { data: categories } = useQuery({
    queryKey: ['categories', 'tree', 'home'],
    queryFn: listCategoryTree,
  });
  if (!categories || categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-gray-100">
        Shop by Category
      </h2>
      <div className="themed-scrollbar flex gap-3 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <CategoryTile key={cat._id} cat={cat} />
        ))}
      </div>
    </section>
  );
}

/**
 * Offers/Deals — reuses the SAME public, unauthenticated `getPublicBanners`
 * CMS mechanism `OffersPage.tsx` already uses for its `'category'`
 * placement (real admin-configured data, not fake promo copy). The
 * dedicated `/coupons/available` endpoint exists but requires an
 * authenticated session (`couponRouter.use(requireAuth)`), so it can't
 * power an anonymous-visitor homepage section without a backend change —
 * banners are the existing, already-public building block for this.
 */
function OffersStrip() {
  const { data: banners } = useQuery({
    queryKey: ['public-banners', 'category', 'home'],
    queryFn: () => getPublicBanners('category'),
  });
  if (!banners || banners.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-gray-100">Offers & Deals</h2>
        <Link to="/offers" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banners.slice(0, 3).map((banner) => (
          <Link
            key={banner._id}
            to={banner.linkUrl || '/offers'}
            className="block overflow-hidden rounded-xl border border-gray-100 transition-shadow hover:shadow-md dark:border-gray-800"
          >
            <img src={banner.imageUrl} alt={banner.title} className="h-32 w-full object-cover sm:h-40" />
          </Link>
        ))}
      </div>
    </section>
  );
}

const TRUST_POINTS = [
  {
    icon: '✅',
    title: '100% Genuine Products',
    description: 'Sourced directly from verified pharmacies and manufacturers.',
  },
  {
    icon: '🔒',
    title: 'Secure Payments',
    description: 'Razorpay-protected checkout — your payment details stay safe.',
  },
  {
    icon: '🚚',
    title: 'Reliable Delivery',
    description: 'Tracked shipping with real-time order status updates.',
  },
  {
    icon: '🩺',
    title: 'Quality Healthcare',
    description: 'Curated medicines and wellness essentials you can trust.',
  },
  {
    icon: '💬',
    title: 'Dedicated Support',
    description: 'Our customer support team is here to help with any order.',
  },
];

/**
 * Popular Products — Part 8 item 6, genuinely distinct from "New Arrivals"
 * (sorted `-createdAt`). The Product model has no `isFeatured` flag or
 * sales-count metric (confirmed by inspection), so this sorts by the
 * REAL, already-existing `ratingCount`/`ratingAvg` fields rather than
 * inventing a new schema field — "most reviewed, highest rated" is a
 * genuine popularity signal already captured by the review system. Renders
 * nothing if no product has actually been rated yet, rather than showing
 * an arbitrary/misleading order as if it means something ("do not create
 * fake products/data just for visual appearance").
 */
function PopularProducts() {
  const { data } = useQuery({
    queryKey: ['products', 'home', 'popular'],
    queryFn: () => listProducts({ limit: 8, sort: '-ratingCount,-ratingAvg' }),
  });
  const items = data?.items.filter((p) => (p.ratingCount ?? 0) > 0) ?? [];
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-gray-100">Popular Products</h2>
        <Link to="/products?sort=-ratingCount" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </section>
  );
}

/**
 * Bulk Purchase / Distributor CTA — Part 8 item 7. The existing
 * `/bulk-purchase` enquiry page was previously reachable only from the
 * header nav and footer link; this gives it a dedicated homepage
 * promotional section, matching the new design system rather than fake
 * product data (it's navigational/marketing copy, not product content).
 */
function BulkPurchaseCta() {
  return (
    <section className="overflow-hidden rounded-2xl bg-deep-teal">
      <div className="flex flex-col items-start gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            For pharmacies & distributors
          </span>
          <h2 className="mt-3 text-xl font-bold text-white sm:text-2xl">
            Buying in bulk? Get distributor pricing.
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-white/70">
            Register as a distributor for volume pricing, dedicated support, and priority fulfillment
            on healthcare essentials.
          </p>
        </div>
        <Link to="/bulk-purchase" className="flex-shrink-0">
          <Button variant="coral" size="lg">
            Enquire now
          </Button>
        </Link>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="rounded-2xl bg-soft-mint px-6 py-10 dark:bg-gray-900/60 sm:px-10">
      <h2 className="text-center text-lg font-semibold text-charcoal-teal dark:text-gray-100">
        Why shop with KarienLabs
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {TRUST_POINTS.map((point) => (
          <div key={point.title} className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm dark:bg-gray-800">
              <span aria-hidden="true">{point.icon}</span>
            </div>
            <p className="text-sm font-medium text-charcoal-teal dark:text-gray-100">{point.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{point.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeSections() {
  const { data: sections } = useQuery({
    queryKey: ['public-home-sections'],
    queryFn: getPublicHomeSections,
  });

  if (!sections || sections.length === 0) return null;

  return (
    <>
      {sections.map((section) => {
        if (section.type === 'category_grid' && section.categoryIds.length > 0) {
          return (
            <section key={section._id}>
              <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-gray-100">
                {section.title}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {section.categoryIds.map((cat) => (
                  <CategoryTile key={cat._id} cat={cat} />
                ))}
              </div>
            </section>
          );
        }
        if (section.productIds.length > 0) {
          return (
            <section key={section._id}>
              <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-gray-100">
                {section.title}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {section.productIds.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={{
                      ...product,
                      gstRate: 0,
                      sku: '',
                      shortDescription: '',
                      description: '',
                      categoryId: '',
                      isActive: true,
                      mainImage: (() => {
                        const img = product.images.find((i) => i.isPrimary) ?? product.images[0];
                        return img ? { url: img.url, publicId: '' } : null;
                      })(),
                      subImages: [],
                    }}
                  />
                ))}
              </div>
            </section>
          );
        }
        return null;
      })}
    </>
  );
}

function TopBrands() {
  const { data } = useQuery({
    queryKey: ['brands', 'public', 'home'],
    queryFn: () => brandApi.list({ limit: 8 }),
  });
  if (!data || data.items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-gray-100">Top Brands</h2>
        <Link to="/brands" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="themed-scrollbar flex gap-3 overflow-x-auto pb-2">
        {data.items.map((brand) => (
          <Link
            key={brand._id}
            to={`/products?brandId=${brand._id}`}
            className="flex min-w-[110px] flex-col items-center gap-2 rounded-lg border border-pale-sage bg-white p-3 text-center hover:border-healthcare-teal dark:border-gray-800 dark:bg-gray-900"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-10 w-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-soft-mint text-lg dark:bg-healthcare-teal/10">
                🏷️
              </div>
            )}
            <span className="line-clamp-1 text-xs font-medium text-gray-700 dark:text-gray-200">
              {brand.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CustomerReviewsStrip() {
  const { data: reviews } = useQuery({
    queryKey: ['reviews', 'recent', 'home'],
    queryFn: listRecentTopReviews,
  });
  if (!reviews || reviews.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-gray-100">
        What Customers Say
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {reviews.map((review) => (
          <Card key={review._id} className="p-4">
            <RatingStars value={review.rating} size="sm" />
            {review.title && (
              <p className="mt-1 text-sm font-medium text-charcoal-teal dark:text-gray-100">
                {review.title}
              </p>
            )}
            <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
              {review.comment}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              — {typeof review.userId === 'object' ? review.userId.name : 'Verified customer'}
              {typeof review.productId === 'object' && `, on ${review.productId.name}`}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function BlogPreview() {
  const { data } = useQuery({
    queryKey: ['public-blogs', 'home'],
    queryFn: () => listPublicBlogs({ limit: 3 }),
  });
  if (!data || data.items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-gray-100">From the Blog</h2>
        <Link to="/blog" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.items.map((blog) => (
          <Link key={blog._id} to={`/blog/${blog.slug}`}>
            <Card className="p-4">
              <span className="text-xs text-gray-400">{formatDate(blog.publishedAt)}</span>
              <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-charcoal-teal dark:text-gray-100">
                {blog.title}
              </h3>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: fallbackProducts, isLoading } = useQuery({
    queryKey: ['products', 'home'],
    queryFn: () => listProducts({ limit: 8, sort: '-createdAt' }),
  });

  useDocumentMeta({
    title: 'Genuine medicines, delivered fast',
    description:
      'Order prescription and OTC medicines online from verified pharmacies. Fast delivery, GST invoices, and secure payments.',
  });

  useEffect(() => {
    if (fallbackProducts?.items.length) {
      trackViewItemList(
        fallbackProducts.items.map((p) => ({
          item_id: p._id,
          item_name: p.name,
          item_category: p.categoryId,
          price: p.basePrice,
        })),
        'New Arrivals',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when the result set changes
  }, [fallbackProducts]);

  return (
    <div className="flex flex-col gap-10">
      <HeroBanner />
      <CategorySlider />
      <OffersStrip />
      <HomeSections />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-charcoal-teal dark:text-gray-100">New Arrivals</h2>
          <Link to="/products" className="text-sm font-medium text-healthcare-teal hover:underline">
            View all
          </Link>
        </div>
        {isLoading ? (
          <SkeletonRows rows={4} columns={4} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {fallbackProducts?.items.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>

      <PopularProducts />
      <TrustSection />
      <BulkPurchaseCta />
      <TopBrands />
      <CustomerReviewsStrip />
      <BlogPreview />
      <RecentlyViewedProducts />
    </div>
  );
}
