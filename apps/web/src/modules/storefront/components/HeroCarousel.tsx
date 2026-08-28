import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { PublicBanner } from '../../../api/public-cms.api';
import { Button } from '../../../components/common/Button';
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
       * sized generously for a 3-line heading; a fixed `max-h` + `overflow-
       * hidden` on the heading/subtitle below caps growth so admin-entered
       * copy can never exceed it and reproduce the original overlap bug.
       * (Not Tailwind's `line-clamp-*` — that sets `-webkit-line-clamp` +
       * `display: -webkit-box`, which has a real Chromium/WebKit rendering
       * bug where the clipped overflow text can flash through at an
       * incorrect, oversized scale when the clamped element's text content
       * changes dynamically, exactly what happens here on every slide swap.
       * A plain height cap has no such issue.)
       */}
      <div className="relative h-[420px] sm:h-[380px] md:h-[26rem]">
        {/*
         * `mode="wait"` — the default crossfade runs the outgoing and
         * incoming slide's animations concurrently, so for a stretch of the
         * transition BOTH are simultaneously at a legible opacity. That's
         * unnoticeable on a busy photo background, but these banners can use
         * a solid/gradient background with prominent white text, where a
         * ~40%-opacity outgoing heading sitting behind an incoming one reads
         * as visibly doubled text, not a subtle blend. `wait` fully finishes
         * the exit animation before the enter animation starts, so only one
         * slide's content is ever on screen — slightly slower overall, but
         * that's the actual requirement here, not a side effect to work
         * around. (Not `mode="popLayout"`, which is for reflowing layout
         * siblings — not applicable since every slide is `absolute inset-0`.)
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
                className="max-h-[78px] max-w-xl overflow-hidden text-xl font-bold leading-tight text-white sm:max-h-[116px] sm:text-3xl md:max-h-[140px] md:text-4xl"
              >
                {active.title}
              </motion.h2>
              {active.subtitle && (
                <motion.p
                  variants={prefersReducedMotion ? undefined : textItemVariants}
                  className="mt-2 max-h-[42px] max-w-md overflow-hidden text-sm text-white/90 sm:max-h-[48px] sm:text-base"
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
