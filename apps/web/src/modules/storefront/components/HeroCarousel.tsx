import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PublicBanner } from '../../../api/public-cms.api';
import { Button } from '../../../components/common/Button';
import { cn } from '../../../utils/cn';

const DEFAULT_SLIDE_DURATION_MS = 6000;
const TRANSITION_DURATION_S = 0.7;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '60%' : '-60%',
    opacity: 0,
    scale: 0.95,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? '-60%' : '60%',
    opacity: 0,
    scale: 0.95,
  }),
};

const textContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};

const textItemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
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
  const sectionRef = useRef<HTMLElement>(null);

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
      className="relative overflow-hidden rounded-2xl bg-ink outline-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      {/*
       * A definite `h-*` is required here, not `min-h`: the image and its
       * `flex flex-col` slide wrapper are absolutely positioned, so
       * `h-full` on them only resolves against a DEFINITE ancestor height —
       * `min-height` alone leaves this box's height indeterminate, which
       * silently falls back to the banner image's own intrinsic aspect
       * ratio (rendering far taller than intended). The mobile height is
       * sized generously for a 3-line heading; `line-clamp` on the
       * heading/subtitle below caps growth so admin-entered copy can never
       * exceed it and reproduce the original overlap bug.
       */}
      <div className="relative h-[420px] sm:h-[380px] md:h-[26rem]">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={active._id}
            custom={direction}
            variants={prefersReducedMotion ? undefined : slideVariants}
            initial={prefersReducedMotion ? { opacity: 0 } : 'enter'}
            animate={prefersReducedMotion ? { opacity: 1 } : 'center'}
            exit={prefersReducedMotion ? { opacity: 0 } : 'exit'}
            transition={transition}
            className="absolute inset-0 flex flex-col"
          >
            <motion.img
              src={active.imageUrl}
              alt={active.imageAlt || active.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading={safeIndex === 0 ? 'eager' : 'lazy'}
              initial={prefersReducedMotion ? false : { scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 6, ease: 'easeOut' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
            <motion.div
              className="relative z-10 mt-auto p-5 pl-16 pr-16 sm:p-10 sm:pl-24 sm:pr-24"
              variants={prefersReducedMotion ? undefined : textContainerVariants}
              initial={prefersReducedMotion ? false : 'hidden'}
              animate="visible"
            >
              {active.badge && (
                <motion.span
                  variants={prefersReducedMotion ? undefined : textItemVariants}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {active.badge}
                </motion.span>
              )}
              <motion.h2
                variants={prefersReducedMotion ? undefined : textItemVariants}
                className="line-clamp-3 max-w-xl text-xl font-bold leading-tight text-white sm:text-3xl md:text-4xl"
              >
                {active.title}
              </motion.h2>
              {active.subtitle && (
                <motion.p
                  variants={prefersReducedMotion ? undefined : textItemVariants}
                  className="mt-2 line-clamp-2 max-w-md text-sm text-white/90 sm:text-base"
                >
                  {active.subtitle}
                </motion.p>
              )}
              <motion.div
                variants={prefersReducedMotion ? undefined : textItemVariants}
                className="mt-4 flex flex-wrap gap-3"
              >
                <Link to={active.linkUrl || '/products'}>
                  <Button variant="coral">{active.ctaText || 'Shop Now'}</Button>
                </Link>
                {active.secondaryCtaText && (
                  <Link to={active.secondaryCtaLink || '/products'}>
                    <Button
                      variant="ghost"
                      className="border border-white/40 text-white hover:bg-white/10"
                    >
                      {active.secondaryCtaText}
                    </Button>
                  </Link>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
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
