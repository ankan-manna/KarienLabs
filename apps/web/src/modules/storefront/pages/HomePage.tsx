import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';

import type { PublicProduct } from '../../../api/products-public.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import { getPublicAboutContent, getPublicBanners, getPublicHomeSections, listPublicBlogs } from '../../../api/public-cms.api';
import type { AboutContentBlock, AboutContentIconKey } from '../../../api/public-cms.api';
import { listRecentTopReviews } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { NewsletterForm } from '../../../components/common/NewsletterForm';
import { RatingStars } from '../../../components/common/RatingStars';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { formatDate } from '../../../utils/format';
import { HeroCarousel } from '../components/HeroCarousel';
import { ProductCard } from '../components/ProductCard';

/**
 * Dynamic CMS (Prompt 3) — every business-content section on this page now
 * fetches from the backend-managed CMS (Banner/HomeSection/Category/Page/
 * Configuration 'about' namespace) instead of hardcoded constants. See
 * docs/BRENTIS_DYNAMIC_CMS_AUDIT.md for the full before/after inventory.
 */

// ---------------------------------------------------------------------------
// Hero — the 2 real hero Banner documents already seeded in the database
// (admin-editable at /admin/cms/banners), fetched live. No hardcoded slide
// array: an empty/loading result renders no hero rather than a fabricated one.
function Hero() {
  const { data: banners, isLoading } = useQuery({
    queryKey: ['public-banners', 'hero'],
    queryFn: () => getPublicBanners('hero'),
  });

  if (isLoading) {
    return <div className="aspect-[16/7] w-full animate-pulse rounded-3xl bg-gray-100 dark:bg-night-elevated" />;
  }
  if (!banners || banners.length === 0) return null;

  return <HeroCarousel banners={banners} />;
}

// ---------------------------------------------------------------------------
// About — admin-managed via /admin/cms/about (Configuration 'about'
// namespace; see about-content.service.ts). Icon choice is a closed enum
// (never free-text/HTML) resolved to one of these fixed SVGs — an unknown
// key falls back to a generic dot icon rather than failing to render.
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCompass() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="m14.5 9.5-1.8 4.3-4.3 1.8 1.8-4.3 4.3-1.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconRx() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M6 4h5a4 4 0 0 1 0 8H9m-3 0v8m3-8 7 8M9 4v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M3 6.5h10v9H3v-9Zm10 3h4l3 3v3h-7v-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M12 20s-7-4.35-9.5-8.5C.75 8 2.5 4.5 6 4.5c2 0 3.5 1.2 4 2.3.5-1.1 2-2.3 4-2.3 3.5 0 5.25 3.5 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6l-7-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconDot() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
const ABOUT_ICONS: Record<AboutContentIconKey, () => ReactElement> = {
  values: IconCheck,
  compass: IconCompass,
  rx: IconRx,
  lock: IconLock,
  verified: IconCheck,
  truck: IconTruck,
  heart: IconHeart,
  shield: IconShield,
};
function resolveAboutIcon(key: AboutContentIconKey | undefined) {
  return (key && ABOUT_ICONS[key]) || IconDot;
}

function AboutSection() {
  const { data: about, isLoading } = useQuery({ queryKey: ['public-about', 'home'], queryFn: getPublicAboutContent });

  if (isLoading) {
    return <div className="h-96 w-full animate-pulse rounded-3xl bg-gray-100 dark:bg-night-elevated" />;
  }
  if (!about || (!about.heading && !about.description)) return null;

  const blocks: AboutContentBlock[] = about.blocks ?? [];

  return (
    <section className="rounded-2xl bg-deep-teal px-4 py-8 dark:bg-night-elevated sm:px-6 sm:py-10">
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,45%)_1fr] lg:gap-16">
      {/* Mobile/tablet: heading+copy read before the image (matches the
          reference's own editorial order — heading, then photo, then the
          4 info blocks); desktop restores the image-left/text-right split. */}
      {about.mainImageUrl && (
        <div className="order-2 overflow-hidden rounded-2xl lg:order-1">
          <img
            src={about.mainImageUrl}
            alt={about.mainImageAlt || about.heading || 'About BRENTIS HEALTHCARE'}
            className="h-56 w-full object-cover sm:h-80 lg:h-full"
            loading="lazy"
          />
        </div>
      )}
      <div className="order-1 flex flex-col gap-6 lg:order-2">
        <div className="flex flex-col gap-3">
          {about.tagline && (
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">{about.tagline}</span>
          )}
          {about.heading && (
            <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
              {about.heading}
            </h2>
          )}
          {about.description && (
            <p className="max-w-xl text-base leading-relaxed text-gray-600 dark:text-night-muted">
              {about.description}
            </p>
          )}
        </div>
        {blocks.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            {blocks.map((block, i) => {
              const Icon = resolveAboutIcon(block.iconKey);
              return (
                <div key={`${block.title}-${i}`} className="flex flex-col gap-2 border-t border-pale-sage pt-4 dark:border-night-border">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-deep-teal text-primary dark:bg-night-elevated">
                    <Icon />
                  </span>
                  <h3 className="font-brentis-display text-sm font-semibold text-ink dark:text-night-text">
                    {block.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-night-muted">{block.description}</p>
                </div>
              );
            })}
          </div>
        )}
        <Link to="/about" className="w-fit">
          <Button variant="outline">Know Our Story</Button>
        </Link>
      </div>
    </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shop by Category — ONE horizontal row (Prompt 3 §6), 4 compact cards
// visible on desktop, horizontal scroll/carousel for the rest. Images come
// straight from the Category record (admin-managed via Cloudinary, see
// CategoryImageFields.tsx) — no hardcoded photo mapping, no Unsplash
// fallback baked into this component. A category with no configured image
// gets a neutral placeholder tile (flagged to the admin in the edit drawer),
// never a stock photo substituted client-side.
interface CategoryNode {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  imageAlt?: string;
  children?: unknown[];
}

function CategoryPlaceholderTile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-gray-300 dark:text-night-border" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m3 16 5-5 4 4 5-6 4 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CategorySection() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { data: categories } = useQuery({ queryKey: ['categories', 'tree', 'home'], queryFn: listCategoryTree });
  if (!categories || categories.length === 0) return null;

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Shop by Category</span>
          <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
            Explore Healthcare Essentials
          </h2>
        </div>
        <div className="hidden flex-shrink-0 gap-2 sm:flex">
          <button
            type="button"
            aria-label="Scroll categories left"
            onClick={() => scrollByCards(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-pale-sage text-ink transition-colors hover:bg-deep-teal dark:border-night-border dark:text-night-text dark:hover:bg-night-elevated"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll categories right"
            onClick={() => scrollByCards(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-pale-sage text-ink transition-colors hover:bg-deep-teal dark:border-night-border dark:text-night-text dark:hover:bg-night-elevated"
          >
            ›
          </button>
        </div>
      </div>
      {/*
        Mobile (<640px): compact 2-column grid — matches Brintoncare's own
        measured mobile behavior exactly (174×242px cards, 2 per row, not a
        horizontal scroll), confirmed via live DOM measurement at 390px
        (docs/BRENTIS_FINAL_REFERENCE_PARITY_AUDIT.md §Categories). The
        reference uses the SAME card aspect ratio on mobile as desktop
        (≈0.72) — only the arrangement changes, not the proportions.
        sm+ (≥640px): the existing single-row horizontal scroll/carousel,
        matching the reference's own desktop/tablet single-row behavior.
      */}
      <div
        ref={scrollerRef}
        className="grid grid-cols-2 gap-3.5 sm:themed-scrollbar sm:-mx-4 sm:flex sm:snap-x sm:snap-mandatory sm:gap-3.5 sm:overflow-x-auto sm:px-4 sm:pb-2"
      >
        {(categories as CategoryNode[]).map((cat) => (
          <Link
            key={cat._id}
            to={`/products?categoryId=${cat._id}`}
            className="group relative aspect-[283/395] overflow-hidden rounded-[20px] transition-all hover:-translate-y-1 hover:shadow-storefront-hover sm:w-[31%] sm:flex-shrink-0 sm:snap-start lg:w-[23%]"
          >
            {cat.imageUrl ? (
              <img
                src={cat.imageUrl}
                alt={cat.imageAlt || cat.name}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-night-elevated">
                <CategoryPlaceholderTile />
              </div>
            )}
            {/*
              Generous, content-width white pill (not a percentage-stretched
              bar) — matches the reference's measured treatment exactly:
              border-radius 33px, 12px/30px padding, 16px/500 label,
              bottom:20px, horizontally centered via left-50%/translateX.
              docs/BRENTIS_FINAL_REFERENCE_PARITY_AUDIT.md §Categories.
            */}
            <span className="absolute bottom-5 left-1/2 w-max max-w-[85%] -translate-x-1/2 rounded-[33px] bg-white px-6 py-3 text-center text-base font-medium leading-snug text-ink shadow-sm">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Best Sellers — THE ONLY product-merchandising section on this page (strict
// requirement, see design-reset doc §9). Prompt 4 §7: category-wise product
// navigation, matching the reference's tabbed pattern (Sun Care/Anti-Ageing/
// etc. on Brintoncare) — here driven by BRENTIS's own real catalog
// categories, never fabricated ones. Prefers an admin-configured
// 'category_tabs' HomeSection (/admin/cms/home-sections); each tab's
// products are resolved live from the real catalog server-side (see
// public-cms.routes.ts) — never duplicated onto a static CMS record, price/
// stock always authoritative. Falls back to a 'product_grid' HomeSection,
// then to newest-first real catalog data, so the section never renders
// empty just because no admin curation exists yet.
function ProductGridRow({ items }: { items: PublicProduct[] }) {
  return (
    <>
      {/*
        Desktop/tablet: a flex row sized to the actual item count — NOT a
        4-column grid. A fixed `grid-cols-4` reserves 4 equal-width tracks
        regardless of how many products exist, so a sparsely-stocked
        category (this catalog currently has as few as 1-2 products in some
        categories) rendered 2 cards on the left and a large dead white gap
        on the right. Each card now has a fixed basis width and the row
        simply stops where the real data stops — never a phantom gap.
      */}
      <div className="hidden gap-5 sm:flex sm:flex-wrap">
        {items.map((product) => (
          <div key={product._id} className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]">
            <ProductCard product={product} imageFit="contain" />
          </div>
        ))}
      </div>
      <div className="themed-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:hidden">
        {items.map((product) => (
          <div key={product._id} className="w-[72%] flex-shrink-0 snap-start">
            <ProductCard product={product} imageFit="contain" />
          </div>
        ))}
      </div>
    </>
  );
}

function BestSellersSection() {
  const { data: homeSections, isLoading: sectionsLoading } = useQuery({
    queryKey: ['public-home-sections', 'home'],
    queryFn: getPublicHomeSections,
  });
  const tabsSection = homeSections?.find((s) => s.type === 'category_tabs' && (s.categoryTabs?.length ?? 0) > 0);
  const gridSection = homeSections?.find((s) => s.type === 'product_grid' && s.productIds.length > 0);

  const [activeTab, setActiveTab] = useState(0);

  const { data: fallbackData, isLoading: fallbackLoading } = useQuery({
    queryKey: ['products', 'home', 'selected'],
    queryFn: () => listProducts({ limit: 4, sort: '-createdAt' }),
    enabled: !tabsSection && !gridSection,
  });

  if (sectionsLoading) {
    return <SkeletonRows rows={1} columns={4} />;
  }

  // --- Category-tab mode (Prompt 4 §7) ---
  if (tabsSection?.categoryTabs) {
    const tabs = tabsSection.categoryTabs;
    const current = tabs[Math.min(activeTab, tabs.length - 1)];
    if (!current || current.products.length === 0) return null;

    return (
      <section className="rounded-2xl bg-deep-teal px-4 py-8 dark:bg-night-elevated sm:px-6 sm:py-10">
        <div className="mb-5 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Best Sellers</span>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
              {tabsSection.title}
            </h2>
            <Link to="/products" className="flex-shrink-0 text-sm font-medium text-accent hover:underline">
              View all →
            </Link>
          </div>
        </div>
        {/* Horizontally scrollable tab bar — works identically as a compact mobile control and a plain row on desktop, matching the reference's "active category indicator" pattern without a separate mobile implementation. */}
        <div
          role="tablist"
          aria-label="Best seller categories"
          className="themed-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.categoryId}
              type="button"
              role="tab"
              aria-selected={i === activeTab}
              onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                i === activeTab
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 hover:bg-deep-teal dark:bg-night-surface dark:text-night-muted dark:hover:bg-night-elevated'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <ProductGridRow items={current.products as unknown as PublicProduct[]} />
      </section>
    );
  }

  // --- Admin-curated product_grid fallback ---
  if (gridSection) {
    const items = gridSection.productIds as unknown as PublicProduct[];
    if (items.length === 0) return null;
    return (
      <section className="rounded-2xl bg-deep-teal px-4 py-8 dark:bg-night-elevated sm:px-6 sm:py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">Selected Products</span>
            <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
              {gridSection.title}
            </h2>
          </div>
          <Link to="/products" className="flex-shrink-0 text-sm font-medium text-accent hover:underline">
            View all →
          </Link>
        </div>
        <ProductGridRow items={items} />
      </section>
    );
  }

  // --- Newest-first real catalog fallback (never fabricated "best seller" data) ---
  if (fallbackLoading) return <SkeletonRows rows={1} columns={4} />;
  if (!fallbackData || fallbackData.items.length === 0) return null;
  return (
    <section className="rounded-2xl bg-deep-teal px-4 py-8 dark:bg-night-elevated sm:px-6 sm:py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Selected Products</span>
          <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
            A Few Essentials Worth Exploring.
          </h2>
        </div>
        <Link to="/products" className="flex-shrink-0 text-sm font-medium text-accent hover:underline">
          View all →
        </Link>
      </div>
      <ProductGridRow items={fallbackData.items} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Healthcare Knowledge — editorial blog teaser. Real seeded posts only
// (listPublicBlogs). No reading-time estimate is shown: the list endpoint
// only returns `excerpt`, not full `content`, so a word-count-based estimate
// here would not be reliably calculated from real data (per the design-reset
// doc's own rule — show it only if reliably calculable), not a fabricated
// round number.
// Same horizontal-scroll-with-arrow-controls pattern as CategorySection —
// matches the reference's own blog carousel (confirmed live: a real Swiper
// carousel over many post cards, not a static grid) rather than a flat,
// never-moving 3-card grid.
function KnowledgeSection() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ['public-blogs', 'home', 'knowledge'],
    queryFn: () => listPublicBlogs({ limit: 6 }),
  });
  if (!data || data.items.length === 0) return null;

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Healthcare Knowledge</span>
          <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
            Knowledge Is Part of Good Care.
          </h2>
        </div>
        <div className="hidden flex-shrink-0 gap-2 sm:flex">
          <button
            type="button"
            aria-label="Scroll articles left"
            onClick={() => scrollByCards(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-pale-sage text-ink transition-colors hover:bg-deep-teal dark:border-night-border dark:text-night-text dark:hover:bg-night-elevated"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll articles right"
            onClick={() => scrollByCards(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-pale-sage text-ink transition-colors hover:bg-deep-teal dark:border-night-border dark:text-night-text dark:hover:bg-night-elevated"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="themed-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2"
      >
        {data.items.map((blog) => (
          <Link
            key={blog._id}
            to={`/blog/${blog.slug}`}
            className="group flex w-[82%] flex-shrink-0 snap-start flex-col gap-3 sm:w-[46%] lg:w-[31%]"
          >
            <div className="aspect-[16/10] overflow-hidden rounded-[20px] bg-gray-50 dark:bg-night-elevated">
              {blog.coverImageUrl && (
                <img
                  src={blog.coverImageUrl}
                  alt={blog.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            {blog.tags[0] && (
              <span className="w-fit rounded-full bg-deep-teal px-2.5 py-0.5 text-[11px] font-medium text-primary dark:bg-night-elevated">
                {blog.tags[0]}
              </span>
            )}
            <h3 className="font-brentis-display text-lg font-semibold text-ink group-hover:text-accent dark:text-night-text">
              {blog.title}
            </h3>
            <p className="line-clamp-2 text-sm text-gray-500 dark:text-night-muted">{blog.excerpt}</p>
            <span className="text-xs text-gray-400 dark:text-night-muted">{formatDate(blog.publishedAt)}</span>
            <span className="text-sm font-medium text-accent">Read article →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why BRENTIS — the "highlights" half of the same admin-managed About
// content document (see AboutContentPage.tsx), rendered in an editorial
// 2-column layout (heading + paragraph + list on the left, one large photo
// on the right) rather than a generic 4-card icon grid.
function WhyBrentisSection() {
  const { data: about } = useQuery({ queryKey: ['public-about', 'home'], queryFn: getPublicAboutContent });
  if (!about) return null;

  const highlights: AboutContentBlock[] = about.highlights ?? [];
  if (!about.highlightsHeading && highlights.length === 0) return null;

  return (
    <section className="rounded-2xl bg-deep-teal px-4 py-8 dark:bg-night-elevated sm:px-6 sm:py-10">
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {about.highlightsTagline && (
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">{about.highlightsTagline}</span>
          )}
          {about.highlightsHeading && (
            <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
              {about.highlightsHeading}
            </h2>
          )}
          {about.highlightsDescription && (
            <p className="max-w-lg text-base leading-relaxed text-gray-600 dark:text-night-muted">
              {about.highlightsDescription}
            </p>
          )}
        </div>
        {highlights.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {highlights.map((item, i) => {
              const Icon = resolveAboutIcon(item.iconKey);
              return (
                <li key={`${item.title}-${i}`} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-deep-teal text-primary dark:bg-night-elevated">
                    <Icon />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-brentis-display text-sm font-semibold text-ink dark:text-night-text">
                      {item.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-gray-500 dark:text-night-muted">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {about.highlightsImageUrl && (
        <div className="overflow-hidden rounded-2xl">
          <img
            src={about.highlightsImageUrl}
            alt={about.highlightsImageAlt || about.highlightsHeading || 'Why BRENTIS'}
            className="h-72 w-full object-cover sm:h-96 lg:h-[30rem]"
            loading="lazy"
          />
        </div>
      )}
    </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Customer Trust — real reviews when they exist (same data source/logic as
// before); when none exist yet (confirmed: no reviews are seeded in this
// environment), falls back to real, verifiable trust facts distinct from the
// "Why BRENTIS" section above (payment/compliance trust, not service
// strengths) — never a fabricated quote, name, or rating.
function CustomerTrustSection() {
  const { data: reviews } = useQuery({ queryKey: ['reviews', 'recent', 'home'], queryFn: listRecentTopReviews });

  if (reviews && reviews.length > 0) {
    return (
      <section>
        <div className="mb-8 flex flex-col gap-2 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Customer Trust</span>
          <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
            What Customers Say.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {reviews.slice(0, 3).map((review) => (
            <Card key={review._id} className="flex flex-col gap-2 border-pale-sage p-5 dark:border-night-border">
              <RatingStars value={review.rating} size="sm" />
              {review.title && (
                <p className="text-sm font-medium text-ink dark:text-night-text">{review.title}</p>
              )}
              <p className="line-clamp-4 text-sm text-gray-500 dark:text-night-muted">{review.comment}</p>
              <p className="mt-auto text-xs text-gray-400">
                — {typeof review.userId === 'object' ? review.userId.name : 'Verified customer'}
              </p>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  // Fallback: no real reviews exist yet in this environment — show
  // verifiable trust facts instead of inventing testimonials.
  return (
    <section className="rounded-3xl border border-pale-sage bg-white px-6 py-12 text-center dark:border-night-border dark:bg-night-surface sm:px-10">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">Customer Trust</span>
      <h2 className="mt-2 font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
        Built on Transparent Practice.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-night-muted">
        We&apos;re a new storefront, so customer reviews are just getting started — here&apos;s what
        you can rely on in the meantime: every order is processed through Razorpay&apos;s secured
        payment infrastructure, priced with GST-inclusive transparency, and sourced only from
        verified pharmacies and manufacturers.
      </p>
    </section>
  );
}

function NewsletterSection() {
  return (
    <section className="overflow-hidden rounded-3xl border border-pale-sage bg-white px-6 py-12 text-center dark:border-night-border dark:bg-night-surface sm:px-10">
      <h2 className="font-brentis-display text-2xl font-bold text-ink dark:text-night-text sm:text-3xl">
        Stay Updated
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-night-muted">
        Get health tips, exclusive offers and new arrivals delivered straight to your inbox.
      </p>
      <div className="mx-auto mt-5 max-w-sm">
        <NewsletterForm variant="light" />
      </div>
    </section>
  );
}

export default function HomePage() {
  useDocumentMeta({
    title: 'Healthcare That Puts People First',
    description:
      'Genuine medicines and everyday wellness essentials from verified pharmacies. Thoughtful healthcare, delivered with care.',
  });

  return (
    <div className="flex flex-col gap-20 sm:gap-24">
      <Hero />
      <AboutSection />
      <CategorySection />
      <BestSellersSection />
      <KnowledgeSection />
      <WhyBrentisSection />
      <CustomerTrustSection />
      <NewsletterSection />
    </div>
  );
}
