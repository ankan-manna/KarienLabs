/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // KarienLabs brand palette. `500` is the exact primary brand color
        // (#FF8000, per the official brand spec) — every other shade is a
        // derived tint/shade of it, kept in the SAME 4-key shape the
        // previous (teal) scale used so every existing `bg-brand-*`/
        // `text-brand-*`/`border-brand-*`/`ring-brand-*` usage across the
        // app (buttons, links, active nav state, focus rings, badges...)
        // repaints automatically — this file is the ONE place the brand
        // color is defined, per the centralized-token requirement.
        brand: {
          50: '#FFF3E6', // subtle tinted backgrounds/hover states
          500: '#FF8000', // primary
          600: '#E67300', // hover/darker accents
          700: '#B25A00', // active/pressed
        },
        // The second brand-gradient stop (#FF8000 → #FF4B33), used only for
        // the small set of major-CTA gradient buttons (Button.tsx's
        // `gradient` variant) — never introduced as a generic scale so it
        // can't accidentally get reused as a flat fill color elsewhere.
        'brand-gradient-end': '#FF4B33',

        // KarienLabs Storefront design system — deliberately a SEPARATE
        // namespace from `brand-*` above, not a replacement of it. `brand-*`
        // remains the Admin Control Panel's theme, completely untouched;
        // these tokens are used ONLY by customer-facing storefront
        // components (Header, Footer, HomePage, ProductCard,
        // ProductDetailPage, ...). Named after the spec's own color names
        // (not Tailwind's built-in `teal`, which has different hex values)
        // so every usage traces directly back to the design system doc.
        // KarienLabs Storefront design system mapped to CSS variables
        'deep-teal': 'var(--color-bg-section)', // Light: #FFF0E8, Dark: #0D282D
        'healthcare-teal': 'var(--color-primary)', // Light: #FF8000, Dark: #FF8A1F
        'soft-mint': 'var(--color-bg-main)', // Light: #FFF7F2, Dark: #081C20
        coral: 'var(--color-secondary)', // Light: #FF4B33, Dark: #FF5A45
        'charcoal-teal': 'var(--color-text-main)', // Light: #172B2F, Dark: #F8F5F2
        'slate-teal': 'var(--color-text-muted)', // Muted text
        'pale-sage': 'var(--color-border)', // Light: #F3D8CC, Dark: #24464B

        // Short semantic aliases used across Button/Header/Footer/HomePage/
        // ProductCard/ProductDetailPage/SearchResultsPage — same underlying
        // variables as above, just the shorter names those call sites use.
        primary: 'var(--color-primary)',
        accent: 'var(--color-secondary)',
        // Static navbar/footer chrome — intentionally does NOT track the
        // light/dark text color (see index.css's --color-ink comment).
        ink: 'var(--color-ink)',

        // Dark-mode counterparts mapped to same variables for backward compatibility
        night: 'var(--color-bg-main)', // Dark: #081C20
        'night-surface': 'var(--color-bg-card)', // Dark: #12343A
        'night-elevated': 'var(--color-bg-section)', // Dark: #0D282D
        'night-border': 'var(--color-border)', // Dark: #24464B
        'night-text': 'var(--color-text-main)', // Dark: #F8F5F2
        'night-muted': 'var(--color-text-muted)', // Dark: #A4BCBA
      },
    },
  },
  plugins: [],
};
