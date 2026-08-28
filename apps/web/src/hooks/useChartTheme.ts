/**
 * Recharts renders its own SVG/tooltip and doesn't see Tailwind's `dark:`
 * classes — `<Tooltip>`'s content box and `<CartesianGrid>`'s stroke need
 * actual color values, not utility classes. One shared hook instead of
 * duplicating this object in every chart page (Analytics, Reports, Search
 * Analytics, Dashboard all need it).
 *
 * Uses the KARIEN theme's own CSS variables (`var(--color-*)`, set in
 * styles/index.css) rather than generic Tailwind gray hex values — those
 * previously didn't match the KARIEN palette at all (e.g. dark tooltips
 * rendered pure blue-gray #111827 instead of the theme's teal-tinted
 * #12343a card color). `var()` resolves live in inline styles just like in
 * a stylesheet, so this also no longer needs an `isDark` branch — the
 * browser repaints it automatically when the `.dark` class toggles.
 */
export function useChartTheme() {
  return {
    gridClassName: 'stroke-[var(--color-border)]',
    tooltipContentStyle: {
      backgroundColor: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      color: 'var(--color-text-main)',
    },
    tooltipLabelStyle: { color: 'var(--color-text-main)' },
    tooltipItemStyle: { color: 'var(--color-text-main)' },
  };
}
