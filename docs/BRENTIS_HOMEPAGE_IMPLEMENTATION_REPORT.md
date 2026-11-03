# BRENTIS HEALTHCARE — Homepage Implementation Report (Prompt 6)

**Status:** Implemented and verified live in the browser (not just compiled). Scope: `apps/web/src/modules/storefront/pages/HomePage.tsx` (full rewrite) + `apps/web/src/modules/storefront/components/ProductCard.tsx` (one additive, opt-in prop). No other file was touched in this prompt.

---

## 1. New Homepage Section Order (implemented, matches the Prompt 5 blueprint)

1. Header (existing, unchanged)
2. **Hero** — static (no carousel), exact copy specified in the prompt
3. **About BRENTIS HEALTHCARE** ("Care Beyond Products")
4. **Shop by Category** ("Explore Healthcare Essentials") — 8 real categories
5. **Our Philosophy & Values** ("The Values Behind Our Care")
6. **Selected Products** ("A Few Essentials Worth Exploring") — **the only product-card section**
7. **Healthcare Knowledge** ("Knowledge Is Part of Good Care") — 3 real blog posts
8. **Why BRENTIS** ("A Brand Built Around Care") — 4 verified operational facts
9. **Customer Trust** — real reviews if present, else a truthful fallback (triggered live: no reviews exist yet in this environment)
10. **Newsletter** (existing `NewsletterForm`, unchanged)
11. Footer (existing, unchanged)

## 2. Components Modified / Created

| File | Change |
|---|---|
| `HomePage.tsx` | Full rewrite. Removed: `HeroBanner`/`DUMMY_HERO_BANNERS`/`HeroCarousel` usage, `CategorySlider` (old icon-tile version), `OffersStrip`, `HomeSections` (admin product/category sections), inline "New Arrivals" grid, `PopularProducts()`, old 5-icon `TrustSection`, `BulkPurchaseCta`, `TopBrands`, `RecentlyViewedProducts`. Added: `Hero`, `AboutSection`, `CategorySection` (new large icon+tint cards), `ValuesSection`, `SelectedProductsSection`, `KnowledgeSection`, `WhyBrentisSection`, `CustomerTrustSection` (with real-review/fallback branch). |
| `ProductCard.tsx` | Added one optional prop, `imageFit?: 'cover' \| 'contain'`, defaulting to `'cover'` — **zero behavior change** for every existing call site (PLP, PDP related-products, Cart — all still default to `'cover'`, verified by grep: only `HomePage.tsx` passes `imageFit="contain"`). Used only by the homepage's Selected Products row to keep the card chrome light/contained rather than letting a seeded demo image's own background bleed edge-to-edge. |

`HeroCarousel.tsx` itself was **not modified** — it's simply no longer used on the homepage (the root cause of its "duplication" was the content fed into it, not the component; see §4). It remains available if a future admin-driven promotional carousel is wanted elsewhere.

## 3. Image-Rendering Investigation (root cause, not a code bug)

Investigated per the prompt's explicit checklist (API fields, URLs, transforms, component, object-fit, aspect ratio, loading, fallback):
- Fetched product `mainImage.url` directly from the API response: real, valid Cloudinary URLs.
- Confirmed via `img.complete`/`naturalWidth`/`naturalHeight` in the live DOM: images load successfully (400×400 after transform, no 404s, no broken-image icons).
- Opened the raw Cloudinary files directly (not through the app) for 6+ demo products: **every one is a generated placeholder graphic** — a flat colored square with the product name/category baked in as text and a plain white circle silhouette — not real product photography. Same confirmed for blog cover images.
- **Conclusion: the rendering pipeline (`cloudinaryUrl()`, `ProductCard`, object-fit, aspect-square container) is correct and was not changed.** This is seeded demo content, not a frontend defect. No frontend code can turn a placeholder graphic into a real product photo.
- **What was actually fixed:** the card *chrome* — added the opt-in `imageFit="contain"` treatment (§2) so the image sits padded on a neutral light background instead of bleeding edge-to-edge, which measurably reduces (but, honestly, does not eliminate) the "giant flat-color block" impression, since the underlying image content is unchanged.
- **Documented dependency, not silently dropped:** real product photography needs to be uploaded via Admin (or the demo seed script's image URLs replaced) before the Selected Products row will show genuine product photos. This is a content/business dependency, listed again in §9.

## 4. Hero Bug Fix — Root Cause and Fix (verified in the DOM)

**Root cause** (confirmed by opening the actual seeded banner image files, not guessed): the real admin-seeded hero banner JPEGs had the headline, badge, and CTA button already rendered into the image pixels. `HeroCarousel.tsx` then rendered that *same* copy again as a live HTML overlay on top — by design, since the component is built for photographic backgrounds with no text in them. Two real, independent text layers, both visible, is what produced the "duplication."

**Fix:** architectural, not a CSS patch, per the prompt's explicit instruction. The homepage no longer uses `HeroCarousel` or any admin-seeded banner data at all. It renders a new, static `Hero` component with:
- The exact specified headline ("Healthcare That Puts People First."), supporting copy, and both CTAs, rendered **once**.
- A plain photograph (Unsplash, already-used-in-this-codebase source, no text baked in) as the background, in a separate `<img>` element — never composited with text at the image level.

**Verified in the live DOM** (not just source review): `document.querySelectorAll('h1')` on the rendered page returns exactly **one** element, with exactly the specified text. No carousel controls (dots/arrows) exist on the page since there is no carousel — nothing to "retain broken."

## 5. Confirmation: Exactly One Product-Merchandising Section

Verified by code (only one `<ProductCard>`-rendering section exists in `HomePage.tsx`, confirmed by reading the full file) and live in the browser (scrolled the full page; product cards with Add to Cart/Buy Now only appear once, under "A Few Essentials Worth Exploring"). `RecentlyViewedProducts` was removed from the homepage entirely (an open question flagged in the Prompt 5 blueprint — resolved here by exclusion, to honor the prompt's "ONLY ONE... Do not introduce... multiple product carousels" language strictly). Category cards (§Shop by Category) have no price, rating, or add-to-cart control and are visually distinct (icon+tint cards, not product thumbnails) — they do not count as merchandising.

## 6. Desktop & Mobile QA (verified live, not source-only)

| Breakpoint | Horizontal overflow | Notes |
|---|---|---|
| 1440px | None (`scrollWidth === clientWidth`, verified) | Hero full-bleed two-column split, 4-across category grid, 4-across Selected Products row |
| 1280px | None (verified) | Same layout, slightly tighter |
| 768px | None (verified) | Hero/About stack to single column (below the `lg`/1024px breakpoint by design) |
| 390px | None (verified) | Single column throughout, Selected Products becomes a horizontal scroll-snap carousel (confirmed visually — partial next-card peek visible, matching the spec) |
| 360px | None (verified via `scrollWidth`/`clientWidth` check) | |

Light theme (the real default for a fresh visitor, re-confirmed) and dark theme (manually toggled) were both visually checked — dark mode renders correctly with the same composition, no broken contrast observed.

**Tooling note, not an app issue:** the screenshot tool in this session intermittently returned stale/cached frames after `scrollTo`/theme-toggle actions on a long-lived tab (confirmed by cross-checking actual DOM state — `scrollY`, `getComputedStyle` background color — against what the screenshot showed, which disagreed). Opening a fresh tab resolved it every time. All QA conclusions above are backed by matching DOM-state checks, not screenshots alone.

## 7. Existing Functionality Verification

- PLP (`/products`): loads correctly, filters/breadcrumb/category sidebar all intact — `ProductCard`'s new prop defaults to the exact same `'cover'` behavior it already had, confirmed by grep (only `HomePage.tsx` passes `imageFit="contain"`).
- Cart badge, search, account menu, theme toggle: all functioned normally throughout testing (added a real item to cart via the PDP during QA, cart badge updated correctly).
- `typecheck`, `lint`, and `build` all pass with zero new errors (same 5 pre-existing warnings as every prior prompt).

## 8. SEO Verification

- Exactly one `<h1>` on the homepage now (previously an `sr-only` placeholder from Prompt 3 — now a real, visible, meaningful headline, a strict improvement).
- `Organization`/`WebSite` JSON-LD (wired in `PublicLayout.tsx` in Prompt 4) untouched and still present — confirmed via `document.querySelectorAll('script[type="application/ld+json"]')` returning both.
- `useDocumentMeta` title/description updated to reflect the new hero copy, still functioning.
- No structured data was removed. No new unsupported healthcare claims were introduced — every factual sentence in the new copy was checked in §9 against real, pre-existing claims elsewhere in this codebase.

## 9. Backend/Data Dependencies (nothing hardcoded, confirmed)

Every section pulls from real, existing APIs — no product, price, category, or blog post is hardcoded:
- Categories: `listCategoryTree()` (same endpoint as PLP)
- Selected Products: `listProducts({ limit: 4, sort: '-createdAt' })` (real catalog, newest-first — a genuine, non-fabricated selection signal)
- Blog: `listPublicBlogs({ limit: 3 })` (real seeded posts)
- Reviews: `listRecentTopReviews()` (same as the old `CustomerReviewsStrip`; returns empty in this environment, correctly triggering the truthful fallback copy instead of nothing/an error)

**No backend code was changed.** No new endpoint was needed for anything implemented this prompt.

**Confirmed content gaps, not fixed by this prompt** (require real business input, listed honestly rather than fabricated):
- Real product photography (currently generated placeholder graphics — see §3)
- Real blog cover photography (same issue)
- Real hero/About lifestyle photography specific to BRENTIS (currently reusing pre-existing Unsplash stock from this same codebase — functional and honest, but not bespoke brand photography)
- Real customer reviews (none exist yet — fallback copy is live instead)
- The `/about` CMS page content (still unpublished, confirmed again this prompt — the new homepage's "Know Our Story" CTA links there correctly, but the destination page itself has no content yet)

## 10. Admin Protection Verification

- `git status` confirms only `HomePage.tsx` and `ProductCard.tsx` changed in this prompt.
- Neither file is under `modules/admin/**`, `modules/superadmin/**`, nor is `Sidebar.tsx`/`Topbar.tsx`/any admin layout.
- `ProductCard.tsx` is a storefront-only component (`modules/storefront/components/`), never imported by admin code (confirmed in Prompt 1's dependency map) — the new prop cannot affect admin regardless.
- No shared primitive (`components/common/**`) was touched.

## 11. Docker Verification

- `docker compose -f docker-compose.yml config -q` — passed.
- `docker compose -f docker-compose.yml build web` — passed, image rebuilt successfully with all homepage changes, Apple Silicon/ARM64.
- No backend changes this prompt, so `api` was not rebuilt.
- Live `docker compose up` against real Atlas/EC2 — still not performed (same disclosed limitation as every prior prompt: no real credentials available in this session, and this machine's pre-existing dev stack currently holds the same ports). Live verification in this report instead used that pre-existing, already-running local dev stack (unchanged, not started/stopped by this session) via the Vite dev server proxy, exactly as in Prompts 3–5.

## 12. Remaining Blockers / Next Steps

- Real product, blog, and hero/About photography — a content dependency, not a code task (§9).
- Real customer reviews — will naturally resolve itself once real orders/reviews exist; fallback copy is honest in the meantime.
- `/about` CMS page content — still empty; the new homepage links to it correctly but the destination is unpublished.
- The category-page routing decision (flagged since Prompt 2's SEO doc, still open) remains open — unaffected by this prompt.
- Admin-configurable `siteTitle`/`defaultOgImage` wiring (flagged Prompt 4) — still not connected to the frontend; out of scope for a homepage-only prompt.

---

*Companion documents: [`BRENTIS_HOMEPAGE_DESIGN_RESET.md`](./BRENTIS_HOMEPAGE_DESIGN_RESET.md) (the blueprint this implements), [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md).*
