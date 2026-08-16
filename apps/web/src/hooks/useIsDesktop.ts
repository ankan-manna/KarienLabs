import { useEffect, useState } from 'react';

/** Tailwind's default `lg` breakpoint (1024px) — the same threshold the admin sidebar uses to decide between a hover/click flyout submenu (desktop) and a tap accordion (mobile/tablet, where hover isn't reliable). */
const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}
