# BRENTIS HEALTHCARE — Homepage Design Reset Blueprint

**Status:** Prompt 5 — research and design blueprint only. **No code was changed in this prompt.** Prompt 6 implements this.
**Scope:** Homepage (`apps/web/src/modules/storefront/pages/HomePage.tsx`) only. Other pages (PLP/PDP/Cart/Checkout/content pages) were already addressed in Prompt 4 and are not in scope for this reset.

---

## 0. Note on the supplied screenshot

The prompt references "the screenshot supplied by the user," but no image was attached to this message. Nothing below relies on an image I didn't actually see — every finding is instead backed by directly inspecting the live running site (`localhost:5173`), its actual seeded data, and the actual Cloudinary-hosted asset files, with evidence shown inline. Where my own earlier reasoning (in Prompt 4's progress notes) turns out to have been wrong, that's corrected explicitly below rather than repeated.

---

## 1. Current Design Problems (verified against the live site, not assumed)

| # | Problem (as reported) | Verified? | Actual root cause |
|---|---|---|---|
| 1 | Too much emphasis on product cards | **Confirmed** | `HomePage.tsx` renders product-card grids in at least 3 separate places: "New Arrivals" (inline section), `PopularProducts()`, and `HomeSections()` (admin-configurable, can add arbitrarily more). Plus `RecentlyViewedProducts()` at the bottom. That's 3–4+ product-grid-shaped sections on one page. |
| 2 | Too many product/category/offer sections | **Confirmed** | Current section order: Hero → CategorySlider → OffersStrip → HomeSections (variable) → New Arrivals grid → PopularProducts grid → TrustSection → BulkPurchaseCta → TopBrands → CustomerReviewsStrip → BlogPreview → NewsletterSection → RecentlyViewedProducts. That's up to 13 sections, at least 5 of which are product/offer/category grids, with zero brand-story or informational content before the fold. |
| 3 | Insufficient informative healthcare content | **Confirmed** | `TrustSection` is 5 generic one-line trust points with icons — no actual brand story, no "who we are," no healthcare philosophy. There is no About/brand-introduction section on the homepage at all today (About content only exists on the separate `/about` CMS page, never surfaced on Home). |
| 4 | Weak brand storytelling | **Confirmed** | Same as #3 — zero narrative content. The homepage jumps straight from hero to commerce. |
| 5 | Oversized flat orange hero | **Confirmed, root cause identified** | Not a CSS bug. The *actual seeded hero banner image* (`https://res.cloudinary.com/dqdbmfdlt/.../banners/iufntj28btbo1uaaridr.jpg`, used for the real "Your Health, Delivered with Care" slide) **is itself a flat solid-orange graphic** with the headline/badge/button already baked into the image pixels — not a photograph. Fetched and visually confirmed directly. |
| 6 | Overlapping/duplicated hero text | **Confirmed, root cause identified — corrects my own earlier Prompt 4 note** | Direct cause of #5: `HeroCarousel.tsx` renders the banner's `title`/`subtitle`/`badge`/CTA as a **live HTML text overlay** on top of the banner image, by design — it's built for photographic backgrounds where text isn't already present. But this seeded banner image already has "Trusted by thousands" / "Your Health, Delivered with Care" / "Shop Now" rendered into the JPEG itself, so the live overlay duplicates it exactly on screen. (I previously — in Prompt 4 — misdiagnosed this as a possible screenshot-tool rendering artifact; it is not. It's a real, reproducible content/data mismatch, confirmed by opening the raw image file directly.) |
| 7 | Product images rendered as white circles/empty placeholders | **Confirmed, root cause identified** | Not a broken-image or asset-mapping bug — images load successfully (`complete: true`, 400×400, real HTTP 200 from Cloudinary). The actual seeded product photo **is** a generated placeholder graphic: a flat colored square with the product name/category baked in as text and a plain white circle silhouette where a product photo would go. Verified by opening the raw Cloudinary file for 6+ different demo products — all follow the identical pattern. This is demo/seed content, not real product photography, and no frontend code change can turn a placeholder graphic into a real product photo. |
| 8 | Dark background dominating the entire page | **Partially confirmed — important correction** | `ThemeContext.tsx` (`getInitialTheme()`) **already defaults new visitors to light theme** (`stored === 'light' \|\| stored === 'dark' ? stored : 'light'` — the fallback is `'light'`, not `'dark'`). Verified directly: cleared this browser session's `localStorage['mc_theme']` (which had been set to `'dark'` from manual testing during Prompt 3/4) and reloaded — the site correctly rendered light theme (`#FFF7F2` background, white cards) for a fresh visit. **What looked like "dark dominating by default" was this testing session's own persisted toggle state, not the site's actual default for a real visitor.** No code change to the default-theme logic is needed. (The header/footer navbar chrome is intentionally a fixed dark color in both themes — `bg-ink` — that's a deliberate, documented design choice, not a bug, and is a thin bar, not "the entire page.") |
| 9 | Narrow/cramped desktop content | **Partially confirmed** | The page container itself is generous (`max-w-[1920px]`, i.e. effectively unconstrained at 1440/1280px). The *cramped* feeling comes from content density, not container width: small square product-card grids (2–4 columns of compact cards) repeated 3–4 times back-to-back create a dense, catalogue-like rhythm with little large-scale typography or breathing room between sections — an information-density problem, not a literal margin problem. |
| 10 | Insufficient editorial design | **Confirmed** | No large-format brand headlines, no lifestyle photography beyond the hero, no narrative text blocks anywhere on Home. |
| 11 | Poor visual hierarchy | **Confirmed** | Every section uses the same pattern (small `h2` + 2–4 column card grid), so nothing reads as more important than anything else — there's no single dominant "this matters most" moment after the hero. |
| 12 | Feels like a catalogue, not a D2C brand | **Confirmed** | Direct consequence of #1–#11 combined. |

---

## 2. Reference Website Analysis (Brintoncare — information architecture, not visuals)

Re-confirmed live (homepage, full scroll). Brintoncare's homepage section order:

1. **Hero carousel** — 6 slides, product-on-pedestal photography (real photos, not flat graphics), one credibility stat overlay ("No.1 Dermatologist Recommended"), one CTA per slide.
2. **About Us** — eyebrow "ABOUT US" → large headline "Unique Formulations to Ensure Holistic Wellness" → 4 value tiles (Core Values / Vision & Mission / International Presence / Why Us), each one short sentence, no padding content.
3. **Categories** — "Browse Through Our Product Categories" — 4 product-line logos (not generic categories, their own sub-brands), simple row, no product cards here.
4. **Our Values** — a *second*, more detailed differentiation section (Collaboration, Trust, Mutual Respect, Leadership, Ownership) — distinct from the About section's Core Values, more texture/photography.
5. **"Available at all leading stores"** — retailer-logo trust marquee.
6. **Best Sellers** — the **first and only** product-card section, tabbed by category (Sun Care / Anti-Ageing / Emollients / Skin Brightening / Hair Care), one row per tab.
7. **Testimonials** — real photo + name + city + quote.
8. **Blog** — "Discover a wealth of knowledge" editorial teaser grid.
9. **Social media** — Instagram grid.
10. **Footer** — sitemap, newsletter, contact, payment badges, accreditations.

**The lesson, stated precisely:** Brintoncare spends **5 full sections** (Hero, About, Categories, Values, Store-trust) establishing brand and credibility *before* showing a single product card, and even then shows exactly **one** product section. Everything after products (testimonials, blog, social) reinforces trust further. Products are the payoff of the story, not the story itself.

---

## 3. New Brand Positioning for BRENTIS HEALTHCARE

Based on what's actually true about this business (confirmed catalog/content, nothing invented):
- **Category:** India OTC + prescription pharmacy — Pain Relief & Fever, Vitamins & Supplements, Diabetes Care, Digestive Health, Allergy & Cold, Personal Care, Wellness & Heart Health, Baby & Mother Care (real seeded categories, confirmed in Prompt 2's catalog audit).
- **Tagline:** "Mind That Cares" — positions the brand around attentiveness/care, not just transaction speed.
- **What can be truthfully said today:** genuine medicines, verified-pharmacy sourcing, secure Razorpay checkout, GST-compliant invoicing, prescription-aware product handling (Rx badges, prescription-required filtering already exist in the product data model).
- **What cannot be claimed** (no supporting data exists): dermatologist/doctor endorsements, clinical studies, awards, certifications, "trusted by thousands" as a literal headline claim (that exact phrase is itself baked into the problematic seed banner — it should not be reused as real marketing copy since it was never verified as a true figure), international presence, years in business.
- **Positioning statement for the new hero/about copy (to draft real content against in Prompt 6):** *a healthcare brand built around careful, attentive service — genuine products, straightforward information, and a buying experience that treats a health purchase with the seriousness it deserves* — phrased without any unverifiable superlative.

---

## 4. New Homepage Information Architecture

Applying Brintoncare's "story before shelf" principle, adapted to BRENTIS's real content and the **strict one-product-row rule** (§9):

1. Header (existing, already rebranded in Prompt 3 — reused as-is)
2. Hero / Brand Introduction
3. About BRENTIS HEALTHCARE (brand story)
4. Shop by Category (category cards — not product cards)
5. Our Philosophy & Values
6. Selected Products (**the only product row**)
7. Healthcare Knowledge & Education (blog)
8. Why Choose BRENTIS
9. Customer Trust
10. Newsletter
11. Footer (existing, already rebranded — reused as-is)

This is **11 sections total**, down from ~13 today, but the composition inverts: today's page is ~60% product/offer grids and ~10% brand content; the new page is ~10% product content (one section) and the rest split between brand story, category discovery, values, education, and trust.

---

## 5. Section-by-Section Wireframe

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (existing — logo, nav, search, account, cart)           │
├──────────────────────────────────────────────────────────────┤
│ HERO                                                            │
│  ┌───────────────────────────┐  ┌───────────────────────────┐ │
│  │ Eyebrow (small, earned)    │  │                           │ │
│  │ H1 — large, one confident  │  │   Real lifestyle/product   │ │
│  │ brand statement             │  │   photography (NOT a      │ │
│  │ Subcopy — 1-2 sentences    │  │   flat-color graphic)      │ │
│  │ [Primary CTA] [text link]  │  │                           │ │
│  └───────────────────────────┘  └───────────────────────────┘ │
│  No text baked into the image. No carousel duplication.        │
├──────────────────────────────────────────────────────────────┤
│ ABOUT BRENTIS HEALTHCARE                                        │
│  Eyebrow "ABOUT US"                                              │
│  H2 — brand story headline                                      │
│  2-3 short paragraphs: who we are / philosophy / commitment     │
│  + real photography (lifestyle or pharmacy/product, not stock   │
│    placeholder)                                                 │
├──────────────────────────────────────────────────────────────┤
│ SHOP BY CATEGORY                                                 │
│  H2 "Shop by Category"                                          │
│  Grid of real categories (8 real ones) as photographic/         │
│  illustrated CATEGORY cards — visually distinct from product    │
│  cards (larger, image-led, no price/rating/add-to-cart)         │
├──────────────────────────────────────────────────────────────┤
│ OUR PHILOSOPHY & VALUES                                          │
│  H2 + 3-5 value tiles (Quality / Care / Trust / Accessibility)  │
│  Short, factual, not overwrought                                 │
├──────────────────────────────────────────────────────────────┤
│ SELECTED PRODUCTS  ← the ONLY product-card section               │
│  H2 "Selected for You" (or similar) + "View all" link            │
│  ONE row — 4 across desktop, horizontal-scroll carousel mobile   │
│  Real products, real prices, real discounts only                 │
├──────────────────────────────────────────────────────────────┤
│ HEALTHCARE KNOWLEDGE & EDUCATION                                 │
│  H2 + 3 real blog posts — image, category, excerpt, "Read       │
│  article" link (reuses real seeded blog content)                 │
├──────────────────────────────────────────────────────────────┤
│ WHY CHOOSE BRENTIS                                                │
│  Real, factual strengths only (verified sourcing, secure         │
│  checkout, GST invoicing, prescription-aware catalog) — NOT a    │
│  copy of the current generic 5-icon TrustSection                 │
├──────────────────────────────────────────────────────────────┤
│ CUSTOMER TRUST                                                   │
│  Real reviews IF any exist in the review system; else an         │
│  honest alternative (see §13) — never fabricated quotes          │
├──────────────────────────────────────────────────────────────┤
│ NEWSLETTER (existing NewsletterForm component, reused)           │
├──────────────────────────────────────────────────────────────┤
│ FOOTER (existing — reused as-is)                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Desktop Layout Specifications (1440px / 1280px)

- **Max content width:** keep the existing `max-w-[1920px]` outer container (it's not the problem — confirmed in §1 #9) but introduce a **narrower reading measure for text-heavy sections** (About, Values, Why Choose): cap paragraph text blocks at `max-w-2xl`–`max-w-3xl` (≈65–75ch) inside the full-width section, per the Design System doc's existing typography guidance — full-width sections, constrained text.
- **Hero:** full-bleed two-column split (text left ~45%, image right ~55%) at ≥1024px, min-height ~560–600px (taller than today's 420px — today's hero is cropped tight because it's trying to fit carousel-text-overlay content; a single confident hero needs more vertical room for large type).
- **Section vertical rhythm:** `space-24` (96px) between major sections at desktop, replacing today's uniform `gap-10` (40px) flex-column spacing — editorial pages need more separation between distinct ideas, not uniform small gaps.
- **Category cards:** 4-across at ≥1280px, each card substantially larger than today's 112px-wide icon tiles — image-led, ~260–300px tall, not icon-in-a-circle.
- **Selected Products row:** exactly 4 columns at ≥1280px (no more, per §9's hard rule), standard `ProductCard` component (already built in Prompt 4), with a "View all →" link to `/products` to the right of the section heading.
- **Typography scale:** reuse Design System doc §2 (Bricolage Grotesque display / Plus Jakarta Sans body) — but the hero H1 and About H2 should actually use the larger end of that scale (48–56px) that the current homepage never reaches (current H2 sections cap at `text-lg`/18px — far too small for an editorial statement).

## 7. Mobile Layout Specifications (390px / 360px)

Not a shrunk desktop — a distinct hierarchy:
1. Hero: image can move above or behind text (single column, text on a scrim over a shorter image, ~70vh), one headline, one CTA — no secondary CTA competing for thumb space.
2. About: image above text (stacked), shortened to 1-2 paragraphs (full desktop copy can be longer; mobile should get a tightened version, not a truncated one — real editing, not `line-clamp`).
3. Categories: horizontal scroll-snap row (reuse the existing `overflow-x-auto` pattern already used elsewhere in this codebase), 2.2 cards visible at a time.
4. Values: stacked single column, 1 per row.
5. **Selected Products:** horizontal scroll-snap carousel (explicit requirement, §9) — not a 2-column wrapped grid.
6. Blog: stacked single column or horizontal scroll (match whichever the category row uses, for consistency).
7. Why Choose / Trust: stacked, generous line-height, no cramped icon grids.
8. Newsletter: full-width single input + button stack.

---

## 8. Image and Asset Requirements

### Confirmed problems (with evidence, §1)
- **Hero banner images** (`migrate-demo-content.ts`'s `BANNERS` array, `placement: 'hero'`): flat-color graphics with baked-in text. **Not usable** for the new hero design, which requires the HeroCarousel's live text overlay to be the *only* text (per the prompt's explicit "no duplicated text" requirement).
- **Product images:** generated placeholder cards (colored square + white circle), not real product photography, for every one of the 14 demo products.
- **Blog cover images:** same generated-placeholder-card pattern (solid color + headline text baked in), not real editorial photography.

### What this means for Prompt 6
This is a **content/data problem, not a code problem** — no amount of CSS or component work fixes a JPEG that already has text baked into it. Two honest paths, to be decided with the user before Prompt 6 writes code:
1. **Source new assets** — real or stock lifestyle/healthcare photography for the hero and About section (clearly licensed, not scraped from Brintoncare per the explicit instruction not to copy their imagery), and continue using the existing real `ProductCard`/ `cloudinaryUrl()` pipeline once real product photos are uploaded via Admin. This is the only path to a genuinely premium result.
2. **Interim placeholder strategy**, clearly labeled as temporary: build the new hero against a photography-shaped layout but use a neutral, non-branded gradient/photo placeholder (not another flat-orange-with-text graphic) until real assets exist, and keep the product-row section visually correct (card component is already fine) even though the underlying photos are still placeholders — **never silently reuse the same existing broken banner/product images in the new layout**, since that would just move today's bug into the new design.

Either way: **the rendering pipeline itself (ProductCard, HeroCarousel, cloudinaryUrl transforms) is confirmed working correctly** (images load, transforms apply, aspect ratios are respected) — Prompt 6 does not need to debug image rendering code, only decide what real assets go into it.

### Logo
Unchanged from Prompt 3's finding: `newLogo.jpeg` is still not a header-ready lockup; the homepage reset doesn't change this. No action needed here beyond what's already documented in the Analysis doc.

---

## 9. Product Display Restriction (hard rule for Prompt 6)

- **Exactly one** product-merchandising section on the homepage.
- Desktop: **one row, ~4 products**, no pagination within the section (it's a teaser, not a catalog page — "View all" links to `/products`).
- Mobile: horizontal scroll-snap carousel, same product set.
- **Removed entirely from Home:** the separate "New Arrivals" grid, `PopularProducts()`, and any product-rendering branch of `HomeSections()` (the category-grid branch of `HomeSections` may stay, since categories ≠ products — see below).
- **Category cards are not product cards** — no price, no rating, no add-to-cart button, no product image; they represent a category (photo/illustration + name + optional short description), linking to `/products?categoryId=...`.
- Which real products populate the "Selected" row is an open question for Prompt 6 to resolve against real data (e.g., admin-curated `HomeSections` product entries if any exist, or a simple real-data sort like highest-rated/newest as the existing `PopularProducts`/New Arrivals logic already does) — not a new decision to invent here, just: whichever single, real, non-fabricated selection logic is used, it must produce **one row**, not several.

---

## 10. Typography and Spacing

Reuses the Design System doc (Prompt 2) as the base system — not a new typography system, but applied far more assertively than the current homepage does:

| Use | Current homepage | New homepage |
|---|---|---|
| Section heading | `text-lg` (18px), `font-semibold` | `text-3xl`–`text-4xl` (30–36px), `font-brentis-display`, real editorial weight |
| Hero H1 | `text-xl`–`text-4xl` responsive, but fighting an overlay-on-graphic problem | `text-5xl`–`text-6xl` (48–60px) desktop, clean single-headline, no competing baked-in text |
| Body/intro copy | Rare — mostly absent | New: `text-lg` intro paragraphs (18px, 1.6 line-height) for About/Values sections, per Design System §2's "Body large" row |
| Section vertical padding | `gap-10` uniform (40px) | `space-24` (96px) desktop / `space-12` (48px) mobile between major sections, per Design System §3 |

No new font families — `Bricolage Grotesque` / `Plus Jakarta Sans` (already loaded, already configured, Prompt 3) are sufficient and already approved; this reset is about *using* the scale that exists, not inventing one.

## 11. Color Usage

**No color changes.** The brief restates the exact same LIGHT/DARK token values already implemented since Prompt 1 (`--color-primary: #FF8000`, etc.) — confirmed these are unchanged in `apps/web/src/styles/index.css`. The only color-related finding is **theme-default**, already addressed in §1 #8: the code already defaults to light, nothing to fix there. The new homepage should:
- Use `bg-main`/`bg-card`/`bg-section` banding exactly as the Design System doc already specifies (alternating white and soft section tint) — the current homepage mostly uses `bg-main`/transparent throughout with the same visual weight for every section, contributing to the flat, undifferentiated feeling.
- Reserve solid orange/coral fills for CTAs and small accents only — never a full-section flat-orange background (directly fixes #1 #5).

## 12. Header/Footer Architecture

**No changes.** Header and Footer were already fully rebranded and verified in Prompt 3 (wordmark, responsive nav, search, cart, mobile hamburger, no overflow at any breakpoint). The prompt's Section 6.1 requirements (nav items, search, account, cart) are already satisfied by the existing `Header.tsx`. Reused as-is. The prompt mentions "an appropriate responsive mega menu if justified by the actual catalog" — with only 8 real categories (confirmed, Prompt 2), a full mega-menu is **not justified**; the existing single-level nav + category sidebar/filter pattern (built in Prompt 4's PLP) is sufficient and simpler. No mega-menu recommended.

## 13. Trust and Content Requirements

- **Reviews:** `CustomerReviewsStrip` already exists and already pulls real reviews only (`listRecentTopReviews`, confirmed in Prompt 3 review — renders nothing if zero real reviews exist, never fabricates). Reuse this component's data-fetching logic for the new "Customer Trust" section; if it returns empty (need to verify against real data in Prompt 6), fall back to a different **truthful** trust section — e.g., the real Rx-aware/GST/secure-checkout facts already identified in §3, not invented testimonials.
- **"Why Choose BRENTIS":** must draw only from verifiable facts already established in this project's docs (verified-pharmacy sourcing claim already used honestly elsewhere in the codebase's own copy — `"Order from verified pharmacies"` — real Razorpay security, real GST invoicing, real prescription-handling data model). **Do not** reintroduce the current `TrustSection`'s unqualified claims ("100% Genuine Products," "Quality Healthcare") without the same care already applied elsewhere — these are borderline today and should be phrased to match what's actually verifiable.
- **Blog:** reuse real seeded blog posts (`listPublicBlogs`) — titles like "Everyday Vitamin & Nutrition Guide" are real, already in the database. **Reading time:** confirmed in Prompt 2's SEO audit that no `readingTime` field exists on the Blog schema — if shown, it must be **reliably calculated client-side** from real word count (e.g., `Math.ceil(wordCount / 200)` minutes), never a hardcoded/invented number, matching the prompt's own "if available or reliably calculated" instruction.
- **Missing information to flag to the business owner** (cannot be invented): a real About-Us brand story/history (the CMS `about-us` page is currently unpublished — confirmed in Prompt 4's QA, returns "Page not available"), any real certifications/accreditations if the business actually holds any, a real company address/phone (ties to the already-documented placeholder-NAP issue).

## 14. Existing Component Reuse Decisions

| Component | Decision |
|---|---|
| `Header.tsx`, `Footer.tsx` | Reuse as-is, no changes |
| `HeroCarousel.tsx` | Reuse the component/mechanism, but **only with photographic banner images that don't already contain text** — the overlay-text design is correct, the current seed data feeding it is not |
| `ProductCard.tsx` | Reuse as-is for the single Selected Products row |
| `CategoryTile` (currently inline in `HomePage.tsx`) | Needs a visual redesign (see §15) but the underlying data-fetching (`listCategoryTree`) is reused |
| `NewsletterForm.tsx` | Reuse as-is |
| `CustomerReviewsStrip` logic (`listRecentTopReviews`) | Reuse the data layer; restyle the presentation to match the new editorial language |
| `BlogCard`/blog data fetching | Reuse `listPublicBlogs`; restyle presentation |
| Design tokens (`tailwind.config.js`, `font-brentis-display`/`font-brentis-body`) | Reuse as-is, already correct (Prompt 3) |

## 15. Components That Need Replacement or Net-New Build

| Component | Why |
|---|---|
| Homepage section composition (`HomePage.tsx` itself) | Full rewrite of section order/composition per §4–§5 — not a reskin, a restructure |
| `CategoryTile` | Current version is a small icon-in-circle tile (112px wide); needs a larger, image-led category card design per §9's "visually distinct from product cards" requirement |
| `TrustSection` | Replace with a real "Why Choose BRENTIS" section using verifiable facts (§13), not generic 5-icon claims |
| New: "About BRENTIS" brand-story section | Does not exist on Home today at all — net new |
| New: "Our Philosophy & Values" section | Does not exist today — net new (distinct from "Why Choose," per Brintoncare's own pattern of having both an About-values moment and a separate differentiation moment) |
| `HomeSections()` (admin-configurable) | Keep only its category-grid rendering branch (if the admin uses it that way); remove/disable its product-grid rendering branch on Home to enforce the one-row rule — needs a product-vs-category decision per entry |
| `PopularProducts()`, inline "New Arrivals" section | Remove from Home entirely (their data-fetching logic can still back the single Selected Products row, just not as separate sections) |
| `OffersStrip` | Likely removed or merged — a dedicated offers banner row is itself another promotional grid; the prompt's "commerce-enabled, not promotion-heavy" principle argues for folding any real active offer into the hero CTA or Selected Products context rather than a standalone banner row. Flagged as an open decision for Prompt 6, not decided unilaterally here. |

---

## 16. Implementation Checklist for Prompt 6 (acceptance criteria)

- [ ] Homepage has exactly **one** product-card-bearing section, confirmed by counting rendered `ProductCard` instances outside of `RecentlyViewedProducts` (which is allowed to remain as a distinct, user-specific, non-promotional utility — confirm with the user whether it counts against the "one section" rule or is exempt as personalization, not merchandising).
- [ ] Hero image contains **no baked-in text** (verify by inspecting the actual image file before wiring it in, exactly as done in this blueprint's research).
- [ ] No duplicated/overlapping text anywhere in the hero at any breakpoint.
- [ ] No empty white-circle product placeholders — either real product photography is used, or a clearly-different (non-circle, non-current-broken-pattern) temporary placeholder is used and labeled as such in code comments.
- [ ] Light theme renders correctly and matches the token spec for a fresh visitor (already true — verify no regression).
- [ ] Section count and order matches §4/§5.
- [ ] No fabricated testimonials, certifications, stats, or claims anywhere on the page — every factual statement traceable to real data or explicitly marked as pending real business input.
- [ ] Zero horizontal overflow at 1440/1280/768/390/360px (same bar as Prompt 4).
- [ ] Admin UI untouched; no shared component (`components/common/**`, `Sidebar.tsx`, `Topbar.tsx`) modified without the same scrutiny applied in Prompt 4.
- [ ] `typecheck`/`lint`/`build` all pass.

---

*Companion documents: [`BRENTIS_UI_REDESIGN_ANALYSIS.md`](./BRENTIS_UI_REDESIGN_ANALYSIS.md), [`BRENTIS_DESIGN_SYSTEM.md`](./BRENTIS_DESIGN_SYSTEM.md), [`BRENTIS_SEO_GEO_AEO_STRATEGY.md`](./BRENTIS_SEO_GEO_AEO_STRATEGY.md), [`BRENTIS_IMPLEMENTATION_ROADMAP.md`](./BRENTIS_IMPLEMENTATION_ROADMAP.md), [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md).*
