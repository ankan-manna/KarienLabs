# BRENTIS → Brintoncare-Style Redesign Plan

## Section Order (matching reference)
1. **Header** — White bg, logo+nav left, search bar right with teal search button, account+cart icons
2. **Hero Slider** — Full-width, light/beige bg, text left, product image right, pagination dots
3. **About Us** — Image collage (overlapping) left with decorative star/squiggle elements, text+4 info blocks right
4. **Categories** — Light gray bg, centered heading with green squiggle, 4 photo cards with white pill labels
5. **Values/Why Us** — Text+heading+squiggle+description left, icon list (2-col), image right with leaf decorations
6. **Marquee Strip** — "AVAILABLE AT ALL LEADING STORES" scrolling text on white bg
7. **Best Sellers** — Centered heading+squiggle, underlined text tabs, 4 product cards on light gray bg with rating badges
8. **Recognition Strip** — Khaki/olive bg band with "Acknowledged by" + media logos
9. **Blogs** — Centered heading+squiggle, 3-column cards with images, category tag, title
10. **Social Media** — Centered heading, Instagram grid
11. **Footer** — Green gradient bg, structured columns (Menu, categories, Policies, Contact), newsletter, accreditations

## Key Visual Changes
- Header: dark → white/light with border-bottom
- Hero: dark overlay → light bg split layout  
- Color accents: orange primary stays, but green squiggle accents match reference's style
- Footer: dark → green gradient
- Product cards: gray bg image area, star rating badges, "Best Seller" orange badges
- Sections have more generous vertical spacing
- Font: keep existing Bricolage Grotesque for headings

## Files to Modify
1. `Header.tsx` — Complete visual overhaul (white bg, reordered layout)
2. `Footer.tsx` — Green gradient, restructured columns
3. `HomePage.tsx` — All sections redesigned
4. `HeroCarousel.tsx` — Light split-layout hero
5. `ProductCard.tsx` — Gray bg, rating badge style
6. `index.css` — Updated CSS variables
7. `tailwind.config.js` — New color tokens if needed
8. `PublicLayout.tsx` — Adjusted container widths
