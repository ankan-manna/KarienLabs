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
      },
    },
  },
  plugins: [],
};
