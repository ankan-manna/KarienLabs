import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PublicBanner } from '../../../api/public-cms.api';
import { Button } from '../../../components/common/Button';
import { useHoverCapable } from '../../../hooks/useHoverCapable';
import { cn } from '../../../utils/cn';

const DEFAULT_SLIDE_DURATION_MS = 6000;
const TRANSITION_DURATION_S = 0.7;

// Opacity only — no `x`/`scale` transform on the slide wrapper. The
// heading/subtitle inside use `line-clamp-*` (`-webkit-line-clamp` +
// `display: -webkit-box`), and that combination has a documented WebKit/
// Chromium rendering bug when ANY ancestor has an active CSS transform
// during the clamp's clipping calculation, not just the clamped element
// itself: the text that should be clipped by the line-clamp can flash
// through at its natural, unclamped size, briefly showing an oversized
// fragment of the heading layered over the correctly-sized text. Confirmed
// by removing the transform from the text's own entrance animation first
// (which didn't fix it — this outer slide-wrapper transform was the actual
// remaining ancestor triggering it) and then here. A plain crossfade reads
// as clean and intentional; direction (`custom`) is no longer used for a
// slide offset but is kept for possible future directional easing.
const slideVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

const textContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};

// Opacity only — no animated `y`/`filter` transform. The heading/subtitle
// below use `line-clamp-*` (Tailwind's `-webkit-line-clamp` + `display:
// -webkit-box`), and animating a `transform` on that SAME element is a
// documented WebKit/Chromium rendering bug: the clipped, supposedly-hidden
// overflow text can flash through at its natural (unclamped, oversized)
// size for part of the transform's duration, visible as a huge stray
// fragment of the heading's own words bleeding through above the correctly-
// sized text. Confirmed via DOM inspection that only one slide is ever
// mounted (see AnimatePresence `mode="wait"` above) — this was never a
// duplicate-element bug, only ever this one property combination. Opacity
// alone doesn't trigger it.
const textItemVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

/**
 * Website Design (Storefront Management) — admin-controlled, auto-advancing
 * hero carousel. Renders ALL active `placement: 'hero'` banners (fetched,
 * sorted by `order`, and scheduling-window-filtered server-side — see
 * `HomePage.tsx`'s `HeroBanner`), auto-advancing every 6s by default (or a
 * banner's own `slideDurationMs` override), with prev/next controls,
 * clickable pagination dots, keyboard arrow-key navigation, and a pause on
 * hover/focus. Manual navigation (dot/arrow/keyboard) resets the auto timer
 * since it re-triggers the same `useEffect` that drives it. Framer Motion
 * powers the slide/fade/scale transition (~0.7s) and a staggered
 * fade+y+blur-to-sharp entrance for the badge/title/description/CTAs;
 * `useReducedMotion` collapses both to a plain, instant crossfade when the
 * visitor has requested reduced motion.
 */
export function HeroCarousel({ banners }: { banners: PublicBanner[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  const prefersReducedMotion = useReducedMotion();
  const hoverCapable = useHoverCapable();
  const sectionRef = useRef<HTMLElement>(null);

  // Identity of the CURRENT banner set, not just its length — e.g. the
  // homepage renders 3 dummy placeholder slides while `GET /banners` is
  // loading, then swaps to N real ones the moment it resolves (HomePage.tsx's
  // `HeroBanner`). Without this, `index`/`direction` carry over across that
  // swap: AnimatePresence sees its key jump from a placeholder id straight to
  // a real one and animates it as a slide transition nobody asked for, and if
  // that lands in the same tick as the auto-advance timer or a manual click,
  // two unrelated transitions overlap — the previous, unrelated slide's exit
  // animation was still mid-flight (readable, not just a fade sliver) when
  // the next one started entering, so both were legible at once. Resetting
  // to slide 0 whenever the slide's *content* actually changes (not just a
  // fresh array reference from the same data) makes a banner-set swap a
  // plain re-render instead of a phantom transition.
  const bannerSetKey = banners.map((b) => b._id).join('|');
  useEffect(() => {
    setIndex(0);
    setDirection(1);
  }, [bannerSetKey]);

  // Clamp in case the banner list itself changes (e.g. a banner gets
  // deactivated by an admin while a visitor's tab is open) and the current
  // index would otherwise point past the end.
  const safeIndex = index % count;
  const active = banners[safeIndex];

  useEffect(() => {
    // A single active slide needs no timer at all — nothing to rotate to.
    if (paused || count <= 1) return undefined;
    const duration =
      active.slideDurationMs && active.slideDurationMs > 0
        ? active.slideDurationMs
        : DEFAULT_SLIDE_DURATION_MS;
    const timer = setTimeout(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % count);
    }, duration);
    return () => clearTimeout(timer);
  }, [safeIndex, paused, active, count]);

  function goTo(i: number) {
    const next = ((i % count) + count) % count;
    setDirection(next > safeIndex || (safeIndex === count - 1 && next === 0) ? 1 : -1);
    setIndex(next);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (count <= 1) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(safeIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(safeIndex + 1);
    }
  }

  const transition = prefersReducedMotion
    ? { duration: 0.2 }
    : { duration: TRANSITION_DURATION_S, ease: [0.4, 0, 0.2, 1] as const };

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden rounded-2xl bg-deep-teal outline-none dark:bg-night-elevated"
      // Pause-on-hover gated to real pointer devices — see useHoverCapable.
      // A touchscreen's synthetic `mouseenter` on tap with no matching
      // `mouseleave` would otherwise pause the carousel permanently after
      // the first touch, with no way to resume auto-advance.
      onMouseEnter={hoverCapable ? () => setPaused(true) : undefined}
      onMouseLeave={hoverCapable ? () => setPaused(false) : undefined}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      {/*
       * Light split layout (text left, product/lifestyle photo right) per
       * docs/ redesign_plan.md — matches the reference's own hero
       * composition instead of a full-bleed photo with white text overlaid
       * on a dark gradient. A definite `h-*` is still required (not `min-h`)
       * for the same reason as before: slides are absolutely positioned, so
       * `h-full` needs a definite ancestor height. The heading/subtitle
       * still use a plain height cap (not Tailwind's `line-clamp-*`) to
       * avoid the same WebKit/Chromium line-clamp + dynamic-content
       * rendering bug documented below.
       */}
      <div className="relative h-[560px] sm:h-[420px] md:h-[26rem]">
        {/*
         * `mode="wait"` — the default crossfade runs the outgoing and
         * incoming slide's animations concurrently, so for a stretch of the
         * transition BOTH are simultaneously at a legible opacity. `wait`
         * fully finishes the exit animation before the enter animation
         * starts, so only one slide's content is ever on screen.
         */}
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={active._id}
            custom={direction}
            variants={prefersReducedMotion ? undefined : slideVariants}
            initial={prefersReducedMotion ? { opacity: 0 } : 'enter'}
            animate={prefersReducedMotion ? { opacity: 1 } : 'center'}
            exit={prefersReducedMotion ? { opacity: 0 } : 'exit'}
            transition={transition}
            className="absolute inset-0 grid grid-cols-1 items-center gap-6 overflow-y-auto px-6 py-8 sm:grid-cols-2 sm:gap-10 sm:overflow-visible sm:px-10 sm:py-10 md:px-16"
          >
            <motion.div
              className="relative z-10 order-2 flex flex-col items-start sm:order-1"
              variants={prefersReducedMotion ? undefined : textContainerVariants}
              initial={prefersReducedMotion ? false : 'hidden'}
              animate="visible"
            >
              {active.badge && (
                <motion.span
                  variants={prefersReducedMotion ? undefined : textItemVariants}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink dark:bg-night-surface dark:text-night-text"
                >
                  {active.badge}
                </motion.span>
              )}
              <motion.h2
                variants={prefersReducedMotion ? undefined : textItemVariants}
                className="font-brentis-display max-h-[96px] max-w-md overflow-hidden text-2xl font-bold leading-tight text-ink dark:text-night-text sm:max-h-[120px] sm:text-3xl md:max-h-[140px] md:text-4xl"
              >
                {active.title}
              </motion.h2>
              {active.subtitle && (
                <motion.p
                  variants={prefersReducedMotion ? undefined : textItemVariants}
                  className="mt-3 max-h-[48px] max-w-sm overflow-hidden text-sm text-gray-600 dark:text-night-muted sm:max-h-[54px] sm:text-base"
                >
                  {active.subtitle}
                </motion.p>
              )}
              <motion.div
                variants={prefersReducedMotion ? undefined : textItemVariants}
                className="mt-5 flex flex-wrap gap-3"
              >
                <Link to={active.linkUrl || '/products'}>
                  <Button variant="coral">{active.ctaText || 'Shop Now'}</Button>
                </Link>
                {active.secondaryCtaText && (
                  <Link to={active.secondaryCtaLink || '/products'}>
                    <Button variant="outline">{active.secondaryCtaText}</Button>
                  </Link>
                )}
              </motion.div>
            </motion.div>
            <div className="relative order-1 h-48 w-full overflow-hidden rounded-2xl sm:order-2 sm:h-full">
              <motion.img
                src={active.imageUrl}
                alt={active.imageAlt || active.title}
                className="h-full w-full object-cover"
                loading={safeIndex === 0 ? 'eager' : 'lazy'}
                initial={prefersReducedMotion ? false : { scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 6, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(safeIndex - 1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-sm transition-colors hover:bg-deep-teal dark:bg-night-surface dark:text-night-text dark:hover:bg-night-elevated sm:flex sm:left-4"
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
            className="absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-sm transition-colors hover:bg-deep-teal dark:bg-night-surface dark:text-night-text dark:hover:bg-night-elevated sm:flex sm:right-4"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5" role="tablist">
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
                  i === safeIndex ? 'w-6 bg-primary' : 'w-1.5 bg-ink/20 hover:bg-ink/40 dark:bg-white/30 dark:hover:bg-white/50',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
