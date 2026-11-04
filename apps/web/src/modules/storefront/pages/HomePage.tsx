import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
          4 info blocks); desktop restores the image-left/text-right split.
          Decorative star + squiggle-arrow accents and the optional
          overlapping secondary photo recreate the reference's collage
          composition — original marks, not traced from the reference. */}
      {about.mainImageUrl && (
        <div className="relative order-2 lg:order-1">
          <StarAccent className="absolute -left-2 -top-4 h-8 w-8 text-secondary/70 sm:-left-4 sm:-top-6 sm:h-10 sm:w-10" />
          <div className="overflow-hidden rounded-2xl">
            <img
              src={about.mainImageUrl}
              alt={about.mainImageAlt || about.heading || 'About BRENTIS HEALTHCARE'}
              className="h-56 w-full object-cover sm:h-80 lg:h-full"
              loading="lazy"
            />
          </div>
          {about.secondaryImageUrl && (
            <div className="absolute -bottom-6 -right-4 h-24 w-24 overflow-hidden rounded-xl border-4 border-deep-teal shadow-lg dark:border-night-elevated sm:-bottom-8 sm:-right-6 sm:h-32 sm:w-32">
              <img
                src={about.secondaryImageUrl}
                alt={about.secondaryImageAlt || 'About BRENTIS HEALTHCARE'}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <ArrowSquiggleAccent className="absolute -bottom-10 left-4 h-10 w-12 text-primary/70 sm:-bottom-12" />
        </div>
      )}
      <div className="order-1 flex flex-col gap-6 lg:order-2">
        <div className="flex flex-col gap-3">
          {about.tagline && (
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">{about.tagline}</span>
          )}
          {about.heading && (
            <>
              <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
                {about.heading}
              </h2>
              <SquiggleAccent className="h-3 w-20 text-primary" />
            </>
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

/**
 * Original hand-drawn-style wavy underline accent — the same idea as the
 * reference's own squiggle flourish beneath its section headings (a generic
 * decorative device, not a specific copyrightable illustration), redrawn
 * from scratch in BRENTIS's own primary color rather than traced/copied.
 */
function SquiggleAccent({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 14" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 10c10-7 20-7 30 0s20 7 30 0 20-7 30 0 20 7 26 2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Original 4-point sparkle mark — a generic decorative device (not a specific copyrightable illustration), redrawn from scratch. */
function StarAccent({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M16 2v10M16 20v10M2 16h10M20 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Original leaf mark — generic decorative device, drawn independently. */
function LeafAccent({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 26c0-12 8-20 20-20-2 10-8 16-18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 24c4-2 8-6 10-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Original hand-drawn-style curved arrow — same generic decorative genre as the reference's own accent marks, drawn independently. */
function ArrowSquiggleAccent({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 36c0-14 10-22 20-22-6 2-10 7-9 12 1 4 6 6 10 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 23l6 6-2-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Centered eyebrow + headline + squiggle accent — matches the reference's
 * own section-header pattern exactly (confirmed via live measurement:
 * centered, not left-aligned; a hand-drawn underline beneath the headline).
 * Used by both CategorySection and KnowledgeSection, which follow the same
 * pattern on the reference site.
 */
function CenteredSectionHeading({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  return (
    <div className="mb-10 flex flex-col items-center gap-2 text-center">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</span>
      <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
        {heading}
      </h2>
      <SquiggleAccent className="mt-1 h-3.5 w-24 text-primary" />
    </div>
  );
}



// A page holds exactly as many cards as the widest (desktop, 4-col) row
// shows at once — mobile's 2-col grid then renders the same page as two
// rows of 2, so nothing is ever cut off mid-card at any breakpoint.
const CATEGORY_CARDS_PER_PAGE = 4;
const CATEGORY_AUTO_ADVANCE_MS = 4000;

/**
 * Matches the reference's own category strip: when there are more
 * categories than fit in one row, it auto-advances through them on a timer
 * rather than showing every card at once in a long static grid. Pauses on
 * hover/focus (same convention as HeroCarousel) and skips the timer
 * entirely for a single page or a reduced-motion preference — there is
 * nothing to rotate to, or the visitor asked not to see motion.
 */
function CategorySection() {
  const { data: categories } = useQuery({ queryKey: ['categories', 'tree', 'home'], queryFn: listCategoryTree });
  const prefersReducedMotion = useReducedMotion();
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  const pages = useMemo(() => {
    const list = (categories as CategoryNode[] | undefined) ?? [];
    const chunks: CategoryNode[][] = [];
    for (let i = 0; i < list.length; i += CATEGORY_CARDS_PER_PAGE) {
      chunks.push(list.slice(i, i + CATEGORY_CARDS_PER_PAGE));
    }
    return chunks;
  }, [categories]);
  const pageCount = pages.length;
  const safePage = pageCount > 0 ? page % pageCount : 0;

  useEffect(() => {
    if (pageCount <= 1 || paused || prefersReducedMotion) return undefined;
    const timer = setTimeout(() => {
      setPage((p) => (p + 1) % pageCount);
    }, CATEGORY_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [safePage, pageCount, paused, prefersReducedMotion]);

  if (!categories || categories.length === 0) return null;

  return (
    <section
      className="bg-[#F8F8F2] px-4 py-10 dark:bg-night-elevated sm:px-8 sm:py-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <CenteredSectionHeading eyebrow="Shop by Category" heading="Explore Healthcare Essentials" />
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${safePage * 100}%)` }}
        >
          {pages.map((group, pageIndex) => (
            <div key={pageIndex} className="grid w-full flex-shrink-0 grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-5">
              {group.map((cat) => (
                <Link
                  key={cat._id}
                  to={`/products?categoryId=${cat._id}`}
                  className="group relative aspect-[283/395] overflow-hidden rounded-[20px] transition-all hover:-translate-y-1 hover:shadow-storefront-hover"
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
                  <span className="absolute bottom-5 left-1/2 w-max max-w-[85%] -translate-x-1/2 rounded-[33px] bg-white px-6 py-3 text-center text-base font-medium leading-snug text-ink shadow-sm">
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      {pageCount > 1 && (
        <div className="mt-7 flex items-center justify-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show category page ${i + 1}`}
              aria-current={i === safePage}
              onClick={() => setPage(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === safePage ? 'w-6 bg-primary' : 'w-1.5 bg-ink/20 dark:bg-night-muted/40'
              }`}
            />
          ))}
        </div>
      )}
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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
      {items.map((product) => (
        <div key={product._id}>
          <ProductCard product={product} imageFit="contain" bestSellerBadge />
        </div>
      ))}
    </div>
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
      <section className="px-4 py-8 sm:px-6 sm:py-10">
        <CenteredSectionHeading eyebrow="Best Sellers" heading={tabsSection.title} />
        {/*
          Underlined-text tabs, centered — matches the reference's own
          "Sun Care | Anti-Ageing | …" tab treatment exactly (confirmed live:
          plain text labels with an underline beneath the active one, not
          filled pill buttons). Horizontally scrollable so it still works as
          a compact mobile control when there are more tabs than fit.
        */}
        <div
          role="tablist"
          aria-label="Best seller categories"
          className="themed-scrollbar -mx-1 mb-6 flex justify-center gap-6 overflow-x-auto px-1 pb-1"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.categoryId}
              type="button"
              role="tab"
              aria-selected={i === activeTab}
              onClick={() => setActiveTab(i)}
              className={`flex-shrink-0 whitespace-nowrap border-b-2 pb-1 text-sm font-medium transition-colors ${
                i === activeTab
                  ? 'border-primary text-ink dark:text-night-text'
                  : 'border-transparent text-gray-500 hover:text-ink dark:text-night-muted dark:hover:text-night-text'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
        <ProductGridRow items={current.products as unknown as PublicProduct[]} />
        <div className="mt-6 text-center">
          <Link to="/products" className="text-sm font-medium text-accent hover:underline">
            View all →
          </Link>
        </div>
      </section>
    );
  }

  // --- Admin-curated product_grid fallback ---
  if (gridSection) {
    const items = gridSection.productIds as unknown as PublicProduct[];
    if (items.length === 0) return null;
    return (
      <section className="px-4 py-8 sm:px-6 sm:py-10">
        <CenteredSectionHeading eyebrow="Selected Products" heading={gridSection.title} />
        <ProductGridRow items={items} />
        <div className="mt-6 text-center">
          <Link to="/products" className="text-sm font-medium text-accent hover:underline">
            View all →
          </Link>
        </div>
      </section>
    );
  }

  // --- Newest-first real catalog fallback (never fabricated "best seller" data) ---
  if (fallbackLoading) return <SkeletonRows rows={1} columns={4} />;
  if (!fallbackData || fallbackData.items.length === 0) return null;
  return (
    <section className="px-4 py-8 sm:px-6 sm:py-10">
      <CenteredSectionHeading eyebrow="Selected Products" heading="A Few Essentials Worth Exploring." />
      <ProductGridRow items={fallbackData.items} />
      <div className="mt-6 text-center">
        <Link to="/products" className="text-sm font-medium text-accent hover:underline">
          View all →
        </Link>
      </div>
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
// Static 3-column grid per the redesign plan (matches the reference's own
// "centered heading+squiggle, 3-column cards" blog-section structure,
// rather than a horizontal carousel) — a "View all articles" link covers
// the rest of the catalog instead of making this section scrollable.
function KnowledgeSection() {
  const { data } = useQuery({
    queryKey: ['public-blogs', 'home', 'knowledge'],
    queryFn: () => listPublicBlogs({ limit: 3 }),
  });
  if (!data || data.items.length === 0) return null;

  return (
    <section>
      <CenteredSectionHeading eyebrow="Healthcare Knowledge" heading="Knowledge Is Part of Good Care." />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {data.items.map((blog) => (
          <Link key={blog._id} to={`/blog/${blog.slug}`} className="group flex flex-col gap-3">
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
              <span className="text-sm text-gray-500 dark:text-night-muted">
                {blog.tags[0]}
              </span>
            )}
            <h3 className="font-brentis-display text-lg font-semibold leading-snug text-ink group-hover:text-accent dark:text-night-text">
              {blog.title}
            </h3>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link to="/blog" className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-primary dark:text-night-text">
          View All Blogs <span aria-hidden="true">›</span>
        </Link>
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
            <>
              <h2 className="font-brentis-display text-3xl font-semibold text-ink dark:text-night-text sm:text-4xl">
                {about.highlightsHeading}
              </h2>
              <SquiggleAccent className="h-3 w-20 text-primary" />
            </>
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
        <div className="relative">
          <LeafAccent className="absolute -right-3 -top-5 h-9 w-9 text-secondary/60 sm:-right-5 sm:-top-7" />
          <div className="overflow-hidden rounded-2xl">
            <img
              src={about.highlightsImageUrl}
              alt={about.highlightsImageAlt || about.highlightsHeading || 'Why BRENTIS'}
              className="h-72 w-full object-cover sm:h-96 lg:h-[30rem]"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trust marquee — matches the reference's "AVAILABLE AT ALL LEADING STORES"
// scrolling strip pattern, but with claims that are actually true for
// BRENTIS (an online-only pharmacy with no retail store network — the
// reference's literal claim would be fabricated here). Every phrase restates
// a real, already-implemented fact from elsewhere in this codebase
// (Razorpay checkout, verified-pharmacy sourcing, GST-transparent pricing,
// Shiprocket-tracked delivery) rather than inventing a new one.
const MARQUEE_ITEMS = [
  'Genuine Medicines',
  'Verified Pharmacies',
  'Secure Razorpay Checkout',
  'GST-Transparent Pricing',
  'Tracked Delivery',
];

function MarqueeSection() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <section className="-mx-4 overflow-hidden border-y border-pale-sage bg-deep-teal py-4 dark:border-night-border dark:bg-night-elevated sm:-mx-6 lg:-mx-8 xl:-mx-10 2xl:-mx-12">
      {/*
        Deliberately always animates, even under prefers-reduced-motion — a
        static ticker reads as broken/frozen rather than reduced, since the
        collapsed single-line text is this strip's entire content with
        nothing else to look at. Every other motion on this page (Hero
        carousel, category carousel) still honors reduced-motion normally.
      */}
      <div className="flex w-max animate-marquee gap-10">
        {items.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-10 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-ink/70 dark:text-night-muted"
          >
            {item}
            <span aria-hidden="true" className="text-primary">
              •
            </span>
          </span>
        ))}
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
      <WhyBrentisSection />
      <MarqueeSection />
      <BestSellersSection />
      <KnowledgeSection />
      <CustomerTrustSection />
      <NewsletterSection />
    </div>
  );
}
