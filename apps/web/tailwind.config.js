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
        'deep-teal': '#0F3035', // primary — navbar/brand color
        'healthcare-teal': '#0D6A68', // secondary
        'soft-mint': '#E5F7F2', // background — hero/healthcare sections
        coral: '#F4664F', // accent/CTA — used sparingly, per spec ("avoid excessive orange")
        'charcoal-teal': '#183D42', // primary text
        'slate-teal': '#6B8587', // muted text
        'pale-sage': '#D9E7E3', // borders

        // Dark-mode counterparts to the palette above. Deliberately a deep,
        // desaturated GREEN rather than near-black (`gray-950`) — dark mode
        // must still read as "the same healthcare brand", not a generic
        // dark-SaaS shell. `deep-teal`/`healthcare-teal`/`coral` above are
        // reused as-is for dark-mode chrome/CTA (they're already dark/vivid
        // enough); these four are the ones with no light-mode equivalent.
        night: '#071F22', // dark page background (NOT pure black)
        'night-surface': '#102A2E', // dark card/section surface
        'night-elevated': '#15353A', // dark elevated surface (modals, popovers, hovered rows)
        'night-border': '#285054', // dark borders/dividers
        'night-text': '#F3FAF8', // dark-mode primary text
        'night-muted': '#A9BFBD', // dark-mode muted/secondary text
      },
    },
  },
  plugins: [],
};
