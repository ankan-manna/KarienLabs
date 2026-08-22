import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PublicBanner } from '../../../api/public-cms.api';
import { Button } from '../../../components/common/Button';
import { cn } from '../../../utils/cn';

const DEFAULT_SLIDE_DURATION_MS = 5000;

/**
 * Website Design (Storefront Management) Part 3/7 — admin-controlled,
 * auto-advancing hero carousel. Previously the homepage only ever showed
 * `banners[0]` as a single static image; this renders ALL active
 * `placement: 'hero'` banners (already fetched, sorted by `order`, and
 * scheduling-window-filtered server-side — see `HomePage.tsx`'s
 * `HeroBanner`), auto-advancing on a per-slide timer (falls back to
 * `DEFAULT_SLIDE_DURATION_MS` when a banner's own `slideDurationMs` is
 * unset), with prev/next controls, pagination dots, and a pause on
 * hover/focus so an admin's carefully-written copy isn't yanked away
 * mid-read. Pure CSS opacity-crossfade (`transition-opacity`) — no
 * animation library, no layout shift (the slide area is a fixed-height
 * box regardless of each image's real dimensions).
 */
export function HeroCarousel({ banners }: { banners: PublicBanner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  // Clamp in case the banner list itself changes (e.g. a banner gets
  // deactivated by an admin while a visitor's tab is open) and the current
  // index would otherwise point past the end.
  const safeIndex = index % count;

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    const current = banners[safeIndex];
    const duration =
      current.slideDurationMs && current.slideDurationMs > 0
        ? current.slideDurationMs
        : DEFAULT_SLIDE_DURATION_MS;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), duration);
    return () => clearTimeout(timer);
  }, [safeIndex, paused, banners, count]);

  function goTo(i: number) {
    setIndex(((i % count) + count) % count);
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-deep-teal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      <div className="relative h-64 sm:h-80 md:h-[26rem]">
        {banners.map((banner, i) => (
          <div
            key={banner._id}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 ease-in-out',
              i === safeIndex ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-hidden={i !== safeIndex}
          >
            <img
              src={banner.imageUrl}
              alt={banner.title}
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep-teal/85 via-deep-teal/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
              <h2 className="max-w-xl text-2xl font-bold text-white sm:text-3xl md:text-4xl">
                {banner.title}
              </h2>
              {banner.subtitle && (
                <p className="mt-2 max-w-md text-sm text-white/90 sm:text-base">{banner.subtitle}</p>
              )}
              <Link to={banner.linkUrl || '/products'}>
                <Button variant="coral" className="mt-4">
                  {banner.ctaText || 'Shop Now'}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(safeIndex - 1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 sm:left-4"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => goTo(safeIndex + 1)}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 sm:right-4"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" role="tablist">
            {banners.map((banner, i) => (
              <button
                key={banner._id}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === safeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
