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
        // Values use the `rgb(var(--x-rgb) / <alpha-value>)` form (not a
        // bare `var(--x)` reference) so Tailwind can actually splice in an
        // opacity modifier — `bg-night-surface/95`, `border-pale-sage/50`,
        // etc. are used throughout the storefront, but Tailwind silently
        // drops any utility combining a slash-opacity modifier with a color
        // that isn't in this alpha-capable form (no build error — the class
        // just never gets generated, leaving whatever rule happens to win
        // the cascade instead, e.g. a card staying light-mode white while
        // its text switched to the dark-mode color). See index.css's
        // `-rgb` companion variables.
        'deep-teal': 'rgb(var(--color-bg-section-rgb) / <alpha-value>)', // Light: #FFF0E8, Dark: #0D282D
        'healthcare-teal': 'rgb(var(--color-primary-rgb) / <alpha-value>)', // Light: #FF8000, Dark: #FF8A1F
        'soft-mint': 'rgb(var(--color-bg-main-rgb) / <alpha-value>)', // Light: #FFF7F2, Dark: #081C20
        coral: 'rgb(var(--color-secondary-rgb) / <alpha-value>)', // Light: #FF4B33, Dark: #FF5A45
        'charcoal-teal': 'rgb(var(--color-text-main-rgb) / <alpha-value>)', // Light: #172B2F, Dark: #F8F5F2
        'slate-teal': 'rgb(var(--color-text-muted-rgb) / <alpha-value>)', // Muted text
        'pale-sage': 'rgb(var(--color-border-rgb) / <alpha-value>)', // Light: #F3D8CC, Dark: #24464B

        // Short semantic aliases used across Button/Header/Footer/HomePage/
        // ProductCard/ProductDetailPage/SearchResultsPage — same underlying
        // variables as above, just the shorter names those call sites use.
        primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-secondary-rgb) / <alpha-value>)',
        // Static navbar/footer chrome — intentionally does NOT track the
        // light/dark text color (see index.css's --color-ink comment).
        ink: 'rgb(var(--color-ink-rgb) / <alpha-value>)',

        // Dark-mode counterparts mapped to same variables for backward compatibility
        night: 'rgb(var(--color-bg-main-rgb) / <alpha-value>)', // Dark: #081C20
        'night-surface': 'rgb(var(--color-bg-card-rgb) / <alpha-value>)', // Dark: #12343A
        'night-elevated': 'rgb(var(--color-bg-section-rgb) / <alpha-value>)', // Dark: #0D282D
        'night-border': 'rgb(var(--color-border-rgb) / <alpha-value>)', // Dark: #24464B
        'night-text': 'rgb(var(--color-text-main-rgb) / <alpha-value>)', // Dark: #F8F5F2
        'night-muted': 'rgb(var(--color-text-muted-rgb) / <alpha-value>)', // Dark: #A4BCBA
      },
      // BRENTIS storefront typography (docs/BRENTIS_DESIGN_SYSTEM.md §2).
      // Deliberately namespaced, NOT merged into Tailwind's default `sans`
      // key — the Admin Control Panel relies on that default and must keep
      // its existing font stack untouched. Only storefront components
      // opt in via `font-brentis-display` / `font-brentis-body`.
      fontFamily: {
        'brentis-display': ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'brentis-body': ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // One additive radius step the default scale doesn't have (between
      // rounded-2xl/16px and rounded-3xl/24px) for hero/large-media use —
      // see Design System doc §3. Everything else in this redesign uses
      // Tailwind's existing default radius/spacing scale as-is.
      borderRadius: {
        'storefront-lg': '20px',
      },
      // Named, brand-ink-tinted shadows (Design System doc §3) — additive
      // keys, not overrides of Tailwind's default shadow-sm/md, so nothing
      // using the default shadow utilities (including Admin) is affected.
      boxShadow: {
        'storefront-sm': '0 1px 2px rgba(23,43,47,0.06)',
        'storefront-md': '0 4px 16px rgba(23,43,47,0.08)',
        'storefront-hover': '0 8px 24px rgba(255,128,0,0.12)',
      },
      // Continuous horizontal scroll for the homepage trust-strip marquee —
      // the track renders its content twice back-to-back and scrolls
      // exactly 50% so the loop is seamless.
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        marquee: 'marquee 24s linear infinite',
      },
    },
  },
  plugins: [],
};
