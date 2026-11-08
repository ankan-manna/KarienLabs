import { useEffect, useState } from 'react';

// `(hover: hover) and (pointer: fine)` is true only for devices with a real
// pointing device (mouse/trackpad) that can genuinely hover without a
// click/tap — false for touchscreens. Auto-advancing carousels (category
// strip, hero banner) use this to gate their "pause on hover" behavior:
// touch browsers fire a synthetic `mouseenter` on tap but frequently never
// fire the matching `mouseleave` (nothing to "leave" with on a touchscreen),
// which otherwise pauses the carousel forever after the very first tap —
// exactly the "broken interactions on mobile" failure this hook prevents.
const HOVER_CAPABLE_QUERY = '(hover: hover) and (pointer: fine)';

export function useHoverCapable(): boolean {
  const [hoverCapable, setHoverCapable] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(HOVER_CAPABLE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(HOVER_CAPABLE_QUERY);
    const handler = (e: MediaQueryListEvent) => setHoverCapable(e.matches);
    mql.addEventListener('change', handler);
    setHoverCapable(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return hoverCapable;
}
