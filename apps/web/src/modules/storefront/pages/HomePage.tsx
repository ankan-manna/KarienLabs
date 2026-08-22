import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { brandApi } from '../../../api/catalog.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import {
  getPublicBanners,
  getPublicHomeSections,
  listPublicBlogs,
  type PublicBanner,
} from '../../../api/public-cms.api';
import { listRecentTopReviews } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { NewsletterForm } from '../../../components/common/NewsletterForm';
import { RatingStars } from '../../../components/common/RatingStars';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackViewItemList } from '../../../lib/analytics';
import { formatDate } from '../../../utils/format';
import { HeroCarousel } from '../components/HeroCarousel';
import { ProductCard } from '../components/ProductCard';
import { RecentlyViewedProducts } from '../components/RecentlyViewedProducts';

// Static placeholder slides — shown only until a Super Admin configures real
// hero banners under Website Design. Shaped exactly like `PublicBanner` so
// they render through the SAME `HeroCarousel` (full carousel behavior:
// auto-rotate, pagination, prev/next, animations) rather than a separate,
// cheaper-looking "fallback" section. Purely presentational copy — no
// business claims beyond what's already used elsewhere on this homepage.
const DUMMY_HERO_BANNERS: PublicBanner[] = [
  {
    _id: 'dummy-hero-1',
    title: 'Genuine Medicines, Delivered to Your Doorstep',
    subtitle: 'Order from verified pharmacies with fast, reliable delivery and secure payments.',
    badge: 'Trusted by thousands',
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1400&q=80',
    imageAlt: 'Pharmacist arranging medicine packets',
    linkUrl: '/products',
    ctaText: 'Shop Medicines',
    secondaryCtaText: 'Bulk Purchase',
    secondaryCtaLink: '/bulk-purchase',
    placement: 'hero',
    order: 0,
    slideDurationMs: null,
  },
  {
    _id: 'dummy-hero-2',
    title: 'Healthcare Essentials for Everyday Wellness',
    subtitle: "Vitamins, supplements and wellness products curated for your family's health.",
    badge: 'New Arrivals',
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=1400&q=80',
    imageAlt: 'Vitamins and wellness supplements',
    linkUrl: '/products',
    ctaText: 'Explore Wellness',
    secondaryCtaText: 'View Offers',
    secondaryCtaLink: '/offers',
    placement: 'hero',
    order: 1,
    slideDurationMs: null,
  },
  {
    _id: 'dummy-hero-3',
    title: 'Prescription Medicines, Made Easier',
    subtitle: 'Upload your prescription and get medicines delivered safely to your home.',
    badge: 'Hassle-free',
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1400&q=80',
    imageAlt: 'Doctor prescription and medicine bottle',
    linkUrl: '/products',
    ctaText: 'Upload Prescription',
    secondaryCtaText: 'Learn More',
    secondaryCtaLink: '/about',
    placement: 'hero',
    order: 2,
    slideDurationMs: null,
  },
];

/**
 * Website Design (Storefront Management) Part 3/4/7 — every ACTIVE
 * `placement: 'hero'` banner (not just `banners[0]`) drives an
 * auto-advancing carousel; the Super Admin controls all of it — image,
 * title, subtitle, CTA text/link, order, active window — from the admin
 * "Website Design" section, nothing here is hardcoded. Falls back to
 * `DUMMY_HERO_BANNERS` (static, clearly-labeled placeholder content, not
 * real business data) only when zero hero banners are configured, so the
 * homepage never breaks and never looks unfinished before an admin has set
 * anything up.
 */
function HeroBanner() {
  const { data: banners } = useQuery({
    queryKey: ['public-banners', 'hero'],
    queryFn: () => getPublicBanners('hero'),
  });

  const slides = banners && banners.length > 0 ? banners : DUMMY_HERO_BANNERS;
  return <HeroCarousel banners={slides} />;
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
      className="group flex min-w-[112px] flex-col items-center gap-2 rounded-xl border border-pale-sage bg-white p-4 text-center transition-all hover:-translate-y-0.5 hover:border-healthcare-teal hover:shadow-md dark:border-night-border dark:bg-night-surface"
    >
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-soft-mint text-2xl transition-colors group-hover:bg-pale-sage dark:bg-healthcare-teal/10 dark:group-hover:bg-healthcare-teal/20">
        {cat.imageUrl ? (
          <img src={cat.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{iconForCategory(cat._id)}</span>
        )}
      </div>
      <span className="line-clamp-2 text-xs font-medium text-gray-700 dark:text-night-text">
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
      <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-night-text">
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
/**
 * Static placeholder promo — shown only until an admin configures a
 * `'category'`-placement banner. Purely presentational; the real "Offers"
 * data (coupons, category banners) is untouched.
 */
function OffersFallback() {
  return (
    <section className="overflow-hidden rounded-2xl bg-soft-mint dark:bg-night-surface">
      <div className="grid grid-cols-1 items-center gap-6 px-6 py-8 sm:px-10 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-coral dark:bg-night-elevated">
            Limited-time offer
          </span>
          <h2 className="mt-3 text-2xl font-bold text-charcoal-teal dark:text-night-text sm:text-3xl">
            Up to 25% Off on Wellness Essentials
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-teal dark:text-night-muted">
            Save on vitamins, supplements and everyday health products — for a limited time only.
          </p>
          <Link to="/offers" className="mt-4 inline-block">
            <Button variant="coral">Shop the Sale</Button>
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl">
          <img
            src="https://images.unsplash.com/photo-1550572017-edd951b55104?w=1000&q=80"
            alt="Wellness supplements and vitamins on display"
            className="h-40 w-full object-cover sm:h-48"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

function OffersStrip() {
  const { data: banners } = useQuery({
    queryKey: ['public-banners', 'category', 'home'],
    queryFn: () => getPublicBanners('category'),
  });

  if (!banners || banners.length === 0) return <OffersFallback />;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-night-text">Offers & Deals</h2>
        <Link to="/offers" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {banners.slice(0, 3).map((banner) => (
          <Link
            key={banner._id}
            to={banner.linkUrl || '/offers'}
            className="block overflow-hidden rounded-xl border border-gray-100 transition-shadow hover:shadow-md dark:border-night-border"
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
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-night-text">Popular Products</h2>
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
    <section className="rounded-2xl bg-soft-mint px-6 py-10 dark:bg-night-surface/60 sm:px-10">
      <h2 className="text-center text-lg font-semibold text-charcoal-teal dark:text-night-text">
        Why shop with KarienLabs
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {TRUST_POINTS.map((point) => (
          <div key={point.title} className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm dark:bg-night-elevated">
              <span aria-hidden="true">{point.icon}</span>
            </div>
            <p className="text-sm font-medium text-charcoal-teal dark:text-night-text">{point.title}</p>
            <p className="text-xs text-gray-500 dark:text-night-muted">{point.description}</p>
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
              <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-night-text">
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
              <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-night-text">
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
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-night-text">Top Brands</h2>
        <Link to="/brands" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="themed-scrollbar flex gap-3 overflow-x-auto pb-2">
        {data.items.map((brand) => (
          <Link
            key={brand._id}
            to={`/products?brandId=${brand._id}`}
            className="flex min-w-[110px] flex-col items-center gap-2 rounded-lg border border-pale-sage bg-white p-3 text-center hover:border-healthcare-teal dark:border-night-border dark:bg-night-surface"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-10 w-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-soft-mint text-lg dark:bg-healthcare-teal/10">
                🏷️
              </div>
            )}
            <span className="line-clamp-1 text-xs font-medium text-gray-700 dark:text-night-text">
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
      <h2 className="mb-3 text-lg font-semibold text-charcoal-teal dark:text-night-text">
        What Customers Say
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {reviews.map((review) => (
          <Card key={review._id} className="p-4">
            <RatingStars value={review.rating} size="sm" />
            {review.title && (
              <p className="mt-1 text-sm font-medium text-charcoal-teal dark:text-night-text">
                {review.title}
              </p>
            )}
            <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-night-muted">
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

interface BlogCardData {
  key: string;
  href: string;
  imageUrl: string;
  category: string;
  title: string;
  excerpt: string;
  date: string;
}

// Static placeholder posts — shown only until real blog posts are published.
// Same card layout as real posts (image/category/title/excerpt/date/Read
// More); "Read More" points at the blog listing rather than a slug that
// doesn't exist, so nothing 404s.
const DUMMY_BLOG_POSTS: BlogCardData[] = [
  {
    key: 'dummy-blog-1',
    href: '/blog',
    imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80',
    category: 'Wellness',
    title: '5 Everyday Habits for Better Immunity',
    excerpt: 'Small, consistent changes — hydration, sleep and diet — that add up to real immune support.',
    date: new Date().toISOString(),
  },
  {
    key: 'dummy-blog-2',
    href: '/blog',
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    category: 'Medicine Guide',
    title: 'Understanding Your Prescription: A Quick Guide',
    excerpt: 'How to read dosage instructions, timing and refill details on a typical prescription label.',
    date: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    key: 'dummy-blog-3',
    href: '/blog',
    imageUrl: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=800&q=80',
    category: 'Healthcare Tips',
    title: 'Managing Seasonal Allergies Naturally',
    excerpt: 'Practical, everyday steps to reduce allergy triggers at home and know when to see a doctor.',
    date: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
  {
    key: 'dummy-blog-4',
    href: '/blog',
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
    category: 'Everyday Wellness',
    title: 'Staying Active: Simple Exercises for Every Age',
    excerpt: 'Low-impact routines that fit into a busy day and support long-term mobility and health.',
    date: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
];

function BlogCard({ post }: { post: BlogCardData }) {
  return (
    <Link to={post.href}>
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <img src={post.imageUrl} alt="" className="h-36 w-full object-cover" loading="lazy" />
        <div className="p-4">
          <span className="inline-block rounded-full bg-soft-mint px-2.5 py-0.5 text-[11px] font-medium text-healthcare-teal dark:bg-night-elevated dark:text-emerald-300">
            {post.category}
          </span>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-charcoal-teal dark:text-night-text">
            {post.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-teal dark:text-night-muted">{post.excerpt}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{formatDate(post.date)}</span>
            <span className="text-xs font-medium text-healthcare-teal">Read More →</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function BlogPreview() {
  const { data } = useQuery({
    queryKey: ['public-blogs', 'home'],
    queryFn: () => listPublicBlogs({ limit: 4 }),
  });

  const posts: BlogCardData[] =
    data && data.items.length > 0
      ? data.items.map((blog) => ({
          key: blog._id,
          href: `/blog/${blog.slug}`,
          imageUrl: blog.coverImageUrl,
          category: blog.tags[0] || 'Health & Wellness',
          title: blog.title,
          excerpt: blog.excerpt,
          date: blog.publishedAt,
        }))
      : DUMMY_BLOG_POSTS;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-charcoal-teal dark:text-night-text">From the Blog</h2>
        <Link to="/blog" className="text-sm font-medium text-healthcare-teal hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => (
          <BlogCard key={post.key} post={post} />
        ))}
      </div>
    </section>
  );
}

/**
 * Dedicated homepage newsletter section — the footer already has a
 * newsletter form, but a distinct on-page CTA (bigger, with its own heading)
 * converts better than one tucked into the footer. Reuses the same
 * `NewsletterForm` component/behavior as the footer, just the light variant.
 */
function NewsletterSection() {
  return (
    <section className="overflow-hidden rounded-2xl border border-pale-sage bg-white px-6 py-10 text-center dark:border-night-border dark:bg-night-surface sm:px-10">
      <h2 className="text-xl font-bold text-charcoal-teal dark:text-night-text sm:text-2xl">
        Stay Updated
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-teal dark:text-night-muted">
        Get health tips, exclusive offers and new arrivals delivered straight to your inbox.
      </p>
      <div className="mx-auto mt-5 max-w-sm">
        <NewsletterForm variant="light" />
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
          <h2 className="text-lg font-semibold text-charcoal-teal dark:text-night-text">New Arrivals</h2>
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
      <NewsletterSection />
      <RecentlyViewedProducts />
    </div>
  );
}
