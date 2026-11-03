# BRENTIS HEALTHCARE — Design System Specification

**Status:** Prompt 2 — specification only. Nothing in this document has been implemented in code yet. Prompt 3 implements against this spec.
**Scope:** Public-facing customer storefront only (`apps/web/src/modules/storefront/**`, `apps/web/src/modules/customer/**`, `Header.tsx`/`Footer.tsx`, `PublicLayout.tsx`/`CustomerLayout.tsx`). Admin/Super Admin visuals are explicitly out of scope and unaffected by anything below.
**Builds on:** [`BRENTIS_UI_REDESIGN_ANALYSIS.md`](./BRENTIS_UI_REDESIGN_ANALYSIS.md) (Prompt 1). Color tokens below are **unchanged** from that document — this spec adds the typography, layout, component, and page-level system Prompt 1 identified as missing.

---

## 1. Design Plan (before/after self-review)

Per the `frontend-design` skill's two-pass process, here is the plan, reviewed against the brief before being finalized below.

**First-pass instinct (what a generic version of this brief would produce):** a warm cream background, a high-contrast serif display face, soft rounded SaaS cards with identical grey drop-shadows, an all-caps tracked eyebrow label above every section heading, numbered `01/02/03` feature markers with no real sequence behind them, and a hero built from a big stat + gradient wash. This is close enough to the skill's documented "AI-generated tell #1" (cream background + serif + warm accent) that it needs a deliberate counter-move, since the brand's color palette (cream base, warm orange/coral accent) was fixed by the user and can't be the differentiator.

**Revision made and why:** the differentiation moves from *color* (which is fixed) into *type choice, motion discipline, and layout concept*. Instead of a high-contrast serif display, BRENTIS uses a confident, slightly characterful **grotesque sans** for display type (not a serif, not Inter) — this alone breaks the cliché's most recognizable signal. Eyebrow labels, numbered markers, and middle-dot meta strings are used only where the content genuinely is a sequence or a label that needs scanning (e.g., checkout steps, which really are a sequence) — not decoratively above every section. Card shadows are restrained to one soft, on-brand tint rather than generic `rgba(0,0,0,.1)` grey. Motion is one deliberate hero-load sequence, not fade-slide-up on every section.

### Token system (plan)

**Color** (fixed by brief, restated here for completeness — not open for revision):
- Primary `#FF8000` / dark `#FF8A1F` — CTAs, active states, key accents
- Secondary `#FF4B33` / dark `#FF5A45` — secondary accents, gradients paired with primary, sale/urgency badges
- Ink `#172B2F` / dark text `#F8F5F2` — body text
- Main bg `#FFF7F2` / dark `#081C20`
- Card bg `#FFFFFF` / dark `#12343A`
- Section bg `#FFF0E8` / dark `#0D282D`
- Border `#F3D8CC` / dark `#24464B`

**Type:**
- **Display/Headlines — "Bricolage Grotesque"** (variable, Google Fonts, OFL-licensed): a grotesque sans with warm, slightly irregular curves at display sizes — reads as considered and human rather than corporate-SaaS, without resorting to a serif. Used for H1/H2, hero statements, and section headings only.
- **Body/UI — "Plus Jakarta Sans"** (variable, Google Fonts, OFL-licensed): clean, rounded-terminal humanist sans for body copy, labels, buttons, forms, and product data (price, SKU info). Rounded terminals echo the logo's organic blob shape without being a literal match. Deliberately not Inter (the most common default) and not the same family as the display face, so the pairing reads as two intentional voices rather than one face doing double duty.
- Both are variable fonts — only 2 font files are loaded (plus weight axis), keeping font-loading cost low (see §16 of the analysis doc / Performance section below).
- No monospace face anywhere in customer-facing UI (monospace for small data labels is a flagged generic tell; prices/SKUs render in Plus Jakarta Sans tabular-number style instead).

**Layout concept:**
- **Primary direction: flat, photography/product-led minimalism** with generous whitespace and alternating `bg-main`/`bg-section` banding (not a dense broadsheet grid, not a wall-to-wall Bento grid).
- **Bento Grid used in exactly one place:** the homepage "Why BRENTIS" / trust-and-values section, where uneven-sized tiles genuinely suit heterogeneous content (a stat, a value statement, an accreditation badge, a short claim) — not applied to product grids, which stay uniform for scannability.
- **Glassmorphism used in exactly one place:** the sticky header's background, which gains a subtle `backdrop-filter: blur()` + translucent surface only after the user scrolls past the hero — a functional affordance (content behind it stays legibly visible), not decoration.
- Alignment: predominantly **left-aligned** text blocks (healthcare/commerce content reads as more trustworthy and scannable left-aligned than centered; centered alignment reserved for short hero statements and empty states only, matching Brintoncare's own mixed pattern observed in §9 of the analysis doc).

```
Hero concept (ASCII wireframe):
┌──────────────────────────────────────────────┐
│  [header: logo | nav | search | account/cart] │
├──────────────────────────────────────────────┤
│  Eyebrow: none (earned, not decorative)        │
│  H1: short, confident claim (left-aligned,     │
│      Bricolage Grotesque, large)               │
│  Subcopy: 1 sentence, Plus Jakarta Sans         │
│  [Primary CTA pill]  [secondary text link]      │
│                                   ┌───────────┐ │
│                                   │ product /  │ │
│                                   │ lifestyle  │ │
│                                   │ photography│ │
│                                   └───────────┘ │
└──────────────────────────────────────────────┘
```

**Principles:**
1. One memorable moment per page — spend boldness once (hero type treatment, or one Bento trust grid), keep product grids/forms/checkout quiet and efficient.
2. Earn every label — no decorative all-caps eyebrows, no `01/02/03` markers unless the content is an actual sequence (checkout steps qualify; "Core Values" tiles do not).
3. Extend the existing token system, never fork it — every new component uses `--color-*` tokens already defined in `apps/web/src/styles/index.css` (per Prompt 1 analysis §5/§13); no new hex values introduced anywhere in this spec.
4. Commerce clarity beats decoration on transactional surfaces (PLP/PDP/cart/checkout) — the Brintoncare reference's restraint on these pages (plain white cards, clear price hierarchy, pill variant selectors) is adopted directly; decorative motifs are reserved for marketing surfaces (home, about).

---

## 2. Typography System

| Role | Font | Weight | Size (desktop / mobile) | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Display H1 (hero) | Bricolage Grotesque | 600 | 56px / 36px | 1.08 | -0.01em |
| H2 (section heading) | Bricolage Grotesque | 600 | 36px / 28px | 1.15 | -0.01em |
| H3 (card/subsection heading) | Bricolage Grotesque | 500 | 24px / 20px | 1.2 | normal |
| H4 (minor heading) | Plus Jakarta Sans | 600 | 18px / 17px | 1.3 | normal |
| Body large (intro/lede text) | Plus Jakarta Sans | 400 | 18px / 16px | 1.6 | normal |
| Body (default) | Plus Jakarta Sans | 400 | 16px / 15px | 1.6 | normal |
| Body small (meta, captions) | Plus Jakarta Sans | 400 | 14px / 13px | 1.5 | normal |
| Label / button text | Plus Jakarta Sans | 600 | 14–15px | 1.2 | 0.01em |
| Price (large, PDP) | Plus Jakarta Sans | 700 | 28px / 24px | 1.2 | normal |
| Price (card) | Plus Jakarta Sans | 700 | 18px / 16px | 1.2 | normal |

- Max line length for body copy: **70–75 characters** (per the skill's <80-char guidance; sans-serif body stays toward the tighter end of that range).
- No sentence is ever set in all-caps for emphasis; category/filter chips use sentence case or title case exactly as the underlying data (`category.name`) provides it, never a forced `text-transform: uppercase`.
- Only one word/phrase is ever styled differently within a heading when the data genuinely requires it (e.g. a price or percentage that must stand out) — never as a generic decorative accent.

### Google Fonts integration note
Both faces are available via Google Fonts (`Bricolage Grotesque`, `Plus Jakarta Sans`), variable-font format. Load via `<link rel="preconnect">` + a single stylesheet link in `apps/web/index.html` (or self-hosted `@font-face` with `font-display: swap` if the team prefers not to depend on Google's CDN — a call for Prompt 3, not made here), scoped to the storefront only if feasible, so Admin's existing type stack (unspecified/default, out of scope) is unaffected either way.

---

## 3. Spacing, Radius, Shadow, Breakpoints

**Spacing scale** (4px base unit, Tailwind-compatible, additive to existing config — does not replace Tailwind defaults, just names the scale actually used in storefront layouts):

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | icon-to-label gaps |
| `space-2` | 8px | tight inline gaps |
| `space-3` | 12px | form field internal padding |
| `space-4` | 16px | default card padding, gaps |
| `space-6` | 24px | card-to-card gaps |
| `space-8` | 32px | sub-section spacing |
| `space-12` | 48px | section internal top/bottom padding (mobile) |
| `space-16` | 64px | section internal top/bottom padding (desktop) |
| `space-24` | 96px | major section-to-section spacing (desktop) |

**Border radius:**

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 8px | input fields, small chips |
| `radius-md` | 12px | product cards, panels |
| `radius-lg` | 20px | hero media, large banners |
| `radius-pill` | 999px | buttons, category chips, variant selectors (direct borrow from Brintoncare's proven pattern, §9 of analysis doc) |

**Shadow** (one restrained elevation system, not generic grey — tinted with the brand ink at low opacity):

| Token | Value |
|---|---|
| `shadow-sm` | `0 1px 2px rgba(23,43,47,0.06)` |
| `shadow-md` | `0 4px 16px rgba(23,43,47,0.08)` |
| `shadow-card-hover` | `0 8px 24px rgba(255,128,0,0.12)` — primary-tinted, used only on interactive hover, not resting state |

Dark theme: shadows shift to pure black at lower opacity (`rgba(0,0,0,0.3–0.4)`) since a warm-tinted shadow is invisible on the dark teal surfaces.

**Breakpoints** (Tailwind defaults, confirmed — no custom scale needed per Prompt 1 analysis §14):
`sm` 640px · `md` 768px · `lg` 1024px · `xl` 1280px · `2xl` 1536px (add only if a wide-desktop hero layout needs it — not committed here).

**Observed reference behavior to match functionally:** Brintoncare collapses to a hamburger nav starting at tablet width (768px), not just mobile (confirmed live in §9 reconnaissance) — BRENTIS should make the same call (`md`-and-below = hamburger) rather than waiting until `sm`, since the mega-menu content doesn't fit comfortably at tablet width either.

---

## 4. Core Components

| Component | Spec |
|---|---|
| **Button — Primary** | Pill radius, solid `primary` bg, `card-bg`-colored text (white in light), 14–15px/600 Plus Jakarta Sans, `space-3`×`space-6` padding, `shadow-sm` resting, `shadow-card-hover` + 2% scale on hover, no default arrow glyph appended (only add `→` where it communicates real navigation, e.g. "View all products →" on a truncated list, not on every CTA) |
| **Button — Secondary/Outline** | Pill radius, transparent bg, 1.5px `primary` border, `primary` text, fills to a soft `primary`-tinted background (not solid) on hover |
| **Button — Ghost/Text** | No border/bg, `primary` text, underline-on-hover only |
| **Product Card** | `radius-md`, `card-bg` surface, `shadow-sm` resting / `shadow-card-hover` on hover, image at top (1:1 or 4:5 ratio, consistent across grid), rating badge (star + number, top-left overlay on image, borrowed pattern from reference), wishlist heart icon (top-right overlay), title (H4, 2-line clamp), price row (current price bold + struck-through MRP + "% OFF" pill badge only when a real discount exists — never fabricated), primary-outline "Add to Cart" or pill "View Options" (when variants exist) |
| **Category Chip** | Pill radius, `section-bg` resting, `primary`-tinted bg + `primary` text on hover/active — directly adapts Brintoncare's category-pill pattern (§9) to BRENTIS tokens |
| **Variant/Size Selector (PDP)** | Row of pill buttons (not a dropdown), each showing size + its own price, `border` resting, `primary` border + `primary`-tinted fill when selected — direct, deliberate adoption of the reference's PDP pattern since it tested well there and fits the existing `PublicProductDetail` variant data model |
| **Price Display** | Current price in `ink`/`text-main`, bold; MRP struck through in `text-muted`; discount badge in `secondary`-tinted pill — only rendered when `mrp > basePrice` from real product data, never invented |
| **Trust Badge** | Small icon + 1-line claim, flat (no card shadow), used in a horizontal strip near the hero and inline on PDP — content must come from real, substantiated claims (see SEO/trust doc — no fabricated certifications) |
| **Section Heading** | H2 (Bricolage Grotesque), optional 1-sentence subcopy below in Body-large, **no eyebrow label by default** — only add one where it adds real scannable value (e.g. a blog post's category tag) |
| **Breadcrumb** | Plus Jakarta Sans 14px, `text-muted` with `/` separators, current page in `ink` — the existing `Breadcrumb.tsx` component (noted in Prompt 1 as admin-used) should be checked for storefront-token compatibility before reuse (see Analysis doc §13 on shared-primitive handling) |
| **Testimonial Card** | Flat, `section-bg` surface (not a shadowed card), quote + name + location, modeled on the reference's restrained pattern — no fabricated testimonials; use real content only, sourced via admin-authored CMS content when available (see SEO/GEO doc for the content-sourcing requirement) |
| **Theme Toggle** | Replace existing emoji icons with inline SVG (sun/moon line icons matching the Header's existing hand-drawn SVG icon style), using `night-*`/semantic tokens instead of hardcoded grays — fixes the gap flagged in Prompt 1 analysis §8 |

---

## 5. Navigation & Header

- **Desktop (≥1024px):** logo left · horizontal nav (Shop, Categories as a hover/click mega-menu, About, Blog, Contact) center-left · search bar (expandable or persistent, decide per content density — persistent recommended given the existing `SearchBar.tsx` combobox already has strong ARIA behavior per Prompt 1 §15, worth keeping visible rather than hiding behind an icon) · account + cart (with live count badge) right.
- **Tablet/Mobile (≤1024px, matching the reference's own breakpoint choice):** logo left, search icon + cart icon + hamburger right. Hamburger opens a full-height off-canvas panel (not a dropdown) with nav links, category list, and account/login links stacked — mirrors the reference's confirmed mobile pattern (§9).
- **Sticky behavior:** header stays fixed on scroll; after scrolling past the hero (~1 viewport height), the header surface gains the one sanctioned glassmorphism treatment (`backdrop-filter: blur(12px)` + `rgba(card-bg, 0.85)`) so it stays legible over scrolling content without being a heavy, permanent glass panel.
- **Mega-menu:** category flyout (adapting the reference's icon-grid pattern, §9) should pull from the real category tree (`listCategoryTree()`, confirmed to exist in `apps/web/src/api/products-public.api.ts` per Prompt 1 §3.7) — not a hardcoded list, since BRENTIS's real categories are unknown/unconfirmed at this stage (see SEO/GEO doc's catalog-data caveat).

---

## 6. Page-by-Page Visual Specification

### 6.1 Homepage
1. **Hero:** single large editorial statement (not a 6-slide carousel by default — the reference's carousel works for a mature catalog with many active promotions; BRENTIS should start with one confident hero and add carousel slides only once there are genuinely multiple live promotions to show, to avoid an empty-feeling rotation). Left-aligned H1 + one-sentence subcopy + primary CTA pill, right side product/lifestyle photography. One orchestrated load-in motion (subtle fade+rise, ~400ms, once) — not per-section repeated animation.
2. **Trust strip:** thin horizontal row directly under the hero — 3–4 short, real claims with small icons (e.g. shipping/return policy highlights, payment security — content must be sourced from actual policy pages, not invented; see SEO/GEO doc).
3. **Category grid:** pill chips or flat image tiles (reuse `Category Chip` or an image-card variant) pulling from the real category tree — count/labels unknown until live data confirmed, spec supports N categories responsively (4-across desktop → 2-across mobile).
4. **"Why BRENTIS" Bento grid:** the one sanctioned Bento moment — mixed-size tiles for brand values/differentiators (adapt the reference's "Our Values" content pattern, §9, to real BRENTIS positioning once provided — do not reuse Brintoncare's actual value copy).
5. **Best sellers / featured products:** tabbed-by-category product carousel (direct, deliberate adoption of the reference's tested tab pattern, §9) using real `ProductCard` data — tabs populated from real categories, not assumed skincare-specific tabs.
6. **Testimonials:** flat testimonial cards, real customer content only (sourced via CMS once available — placeholder/lorem content must never ship to production).
7. **Blog teaser:** 3–6 card grid, image + category tag + heading + "Read article" link, pulling from real blog CMS data.
8. **Footer:** per §7 below.

### 6.2 Product Listing / Category Page
- Breadcrumb (Home / Category).
- Left sidebar (desktop) / drawer (mobile): Category filter, Price range, Availability — matches the reference's filter set (§9), implemented against the existing product/category API rather than inventing new filter dimensions not supported by the backend (confirm filterable fields against `products-public.api.ts` in Prompt 3).
- Sort dropdown (Popularity/Price/Newest — confirm actual supported sort options against the API before specifying all of them in Prompt 3).
- Product grid: 4-across desktop / 2-across tablet / 1–2-across mobile, uniform `Product Card`.
- Pagination: the reference uses "Load More" (§9); BRENTIS's existing `ProductListPage.tsx` pagination mechanism (confirmed by the SEO audit doc to be query-param based) should decide between "Load More" (better perceived performance, matches reference) vs numbered pagination (better for SEO crawlability of deep catalog pages) — **this is a real SEO/UX tradeoff, flagged for a joint decision with the SEO doc, not decided unilaterally here.**

### 6.3 Product Detail Page
- Breadcrumb · image gallery (main + thumbnail strip, zoom-on-hover optional) with wishlist/share icon overlay · title · rating · price block · `Variant/Size Selector` · sticky "Buy Now" (solid) + "Add to Cart" (outline) button pair (mirrors reference, §9, and fits existing `CheckoutPage`/`cart.api.ts` flow) · benefits/description (bulleted, from real product data — `shortDescription`/`description`/`medicine.*` fields per Prompt 1 §3.7) · specifications table (from real fields only — composition/dosageForm/strength where `medicine` data exists) · related products row (reuse `RecentlyViewedProducts.tsx` pattern/placement if applicable) · reviews section (`ProductReviews.tsx`, already exists).

### 6.4 Cart Page
- Flat, functional — line items (image, name, variant, qty stepper, price, remove), coupon input, order summary panel (sticky on desktop), empty-state illustration + "Shop Now" CTA (direct adoption of the reference's empty-cart pattern, §9 — simple, friendly, not over-designed) using existing `Cart`/`CartItem` data model, no changes to cart logic.

### 6.5 Checkout Page
- This is the one place a numbered sequence (`01 → 02 → 03`) is **earned**, since checkout genuinely is a linear process (Address → Payment → Confirmation, matching the existing `CheckoutPage.tsx` flow). Minimal decoration, maximum clarity; Razorpay widget styling is third-party and out of this spec's control.

### 6.6 About Us
- Large editorial H1 statement (adapt reference's oversized-type pattern, §9, to real BRENTIS positioning copy — not invented claims about the company) + one Bento or icon-row value section + team/mission content as available from real CMS/admin content.

### 6.7 Contact Us
- Two-column: contact details (real phone/email, once confirmed — see SEO/GEO doc's NAP-accuracy requirement) + simple rounded-input form (Name, Phone/Email, Message), direct, deliberate adoption of the reference's clean contact-form layout (§9).

### 6.8 Blog List / Detail
- List: featured-card row (2–3 large cards) + grid of remaining posts, category tag + date + "Read article" — matches reference pattern (§9).
- Detail: single-column article, max ~70ch line length, author/date byline (contingent on the blog schema actually having an author field — confirmed/denied in the SEO/GEO/AEO doc), related-posts footer.

### 6.9 Policy Pages (Privacy/Terms/Returns/Shipping)
- Single-column prose, H1 + H2 subheadings, no decorative elements — matches reference's plain, trustworthy legal-page treatment (§9) exactly; legal text itself is a content/compliance task, not a design task (see Healthcare Trust section of the SEO/GEO/AEO doc).

### 6.10 Account Pages
- Not visually referenced from Brintoncare (its account UI wasn't modally inspected in this pass — see analysis doc limitations). Spec: reuse the established component set (cards, pills, buttons) in a standard dashboard-with-sidebar-tabs layout consistent with the rest of the storefront; no new patterns introduced.

---

## 7. Footer

Sitemap columns (Menu / Categories / Policies) + newsletter signup + contact (email/phone, once real values are confirmed) + social icons + payment-method icons + accreditation badges (only real, substantiated ones — see Healthcare Trust requirements) + copyright line with the real legal entity name. Visual treatment: flat `section-bg` (dark-teal-tinted in light mode is not appropriate here — use the existing `bg-section`/`night-surface` tokens, not a borrowed green wave shape from the reference, since that specific decorative device is Brintoncare's own visual signature and should not be copied verbatim per the brief's explicit instruction).

---

## 8. Iconography

- Style: consistent inline-SVG line icons (matches the existing hand-drawn-style icons already in `Header.tsx`/`Footer.tsx` per Prompt 1 §8) — no icon font, no mixed icon libraries, no emoji in UI chrome (directly fixes the `ThemeToggle.tsx` gap).
- One accent motif (a single simple line-drawn flourish, e.g. a small heart/pulse mark consistent with the logo's heart-dot detail) used sparingly on hero/about sections only — a BRENTIS-original mark, not a copy of the reference's lime squiggle/sparkle.

## 9. Animation

- One orchestrated hero load-in per page (fade + 8–12px rise, ~350–450ms, ease-out), not repeated per-section on scroll.
- Hover/interaction transitions: 150–200ms ease, applied to buttons, cards, and the variant selector only — not globally.
- `prefers-reduced-motion: reduce` must disable all non-essential motion (hero load-in and hover transforms collapse to instant/opacity-only) — required, not optional (see Accessibility/Performance section below).
- `framer-motion` (already a dependency, per Prompt 1 §2) is sufficient — no new animation library needed.

## 10. Light/Dark Theme Behavior

No change to the existing mechanism (`ThemeContext.tsx`, explicit toggle, `localStorage`-persisted, class-based) — confirmed sound in Prompt 1 and reused as-is. All new components must be authored with both `:root` and `.dark` token values from day one (no component ships light-only).

---

## 11. Accessibility & Performance Guardrails (design-level)

- Maintain the existing ARIA quality bar (search combobox, PDP thumbnail selector — confirmed strong in Prompt 1 §15); no new interactive pattern (mega-menu, Bento tiles, variant selector) ships without keyboard operability and visible focus states.
- Contrast: all new text/background pairings must be checked against WCAG AA once implemented (flagged, not yet verified — Prompt 1 §15).
- New hero/product imagery: served responsively, `loading="lazy"` below the fold, explicit `width`/`height` to prevent CLS.
- Two variable font files only, `font-display: swap`, to protect LCP/CLS — no additional font families.
- No new animation/icon/UI dependency beyond what's already installed (`framer-motion` covers all motion needs above).

---

## 12. New Workflow — Measured Addendum (research-only prompt, appended not overwritten)

Everything in §1–11 above predates this addendum and is unchanged. This section adds exact, freshly-measured values from a real live-browser audit (see [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md) for the full methodology and tool-by-tool proof) — used to refine, not replace, the system above.

### 12.1 Container & section rhythm

- Content width at 1440px viewport: **1360px** (`main`'s own `max-width:1920px` is a non-constraint at this viewport; the effective width comes from `40px` left/right padding — `1440 − 80 = 1360`).
- **Measured root cause of "feels monotone/flat":** 5 of the 9 homepage sections render with `background-color: rgba(0,0,0,0)` (fully transparent, showing the raw page background with zero section-to-section color variation) — About, Categories, Products, Knowledge, Why-BRENTIS. Only Hero (deliberate dark navy), Values (`#FFF0E8`, correct), Trust, and Newsletter (white, correct) use an explicit background. **Rule to apply going forward:** alternate `bg-main` (`#FFF7F2`/`#081C20`) and `bg-section` (`#FFF0E8`/`#0D282D`) across consecutive sections — both tokens already exist in §Branding, no new colors needed, this is a sequencing fix only.

### 12.2 Product card (measured, both sites, 1440px)

| | Card | Image area | Button height |
|---|---|---|---|
| Reference (Brintoncare) | 278×486px | 278×278px (1:1) | 44px, single CTA |
| BRENTIS (current) | 325×468px | 275×275px (1:1) | 34px × 2 CTAs |

Image aspect ratio is already correctly matched (1:1 on both). The measured size gap is modest (+17% width / −4% height) — not the dramatic difference a casual look suggests. If a more compact card is still wanted, the lever is the two-button row, not the card footprint.

### 12.3 Category card (measured, BRENTIS, 1440px)

328×458px rendered, 8 cards, 4-column grid, 16px gap — ratio 0.716, an exact match to the `283:395` (0.716) proportion carried over from the original reference measurement; the current implementation's `aspect-[283/395]` utility is rendering precisely as specified.

### 12.4 About section image (corrected)

Reference is **1 single photograph** (990×1190 natural, 409×492 rendered @1440px, `border-radius:20px`), not a 2-photo collage as an earlier, screenshot-based pass assumed — re-measured directly via `querySelectorAll('img')` + `getComputedStyle`. BRENTIS's own About image treatment (1 photo, same general proportions) already matches this corrected understanding.

### 12.5 Header (measured both sites, 1440px)

Reference: 79.2px, `fixed`, white, subtle shadow. BRENTIS: 66px, `sticky`, dark navy (`#172B2F` — deliberate, matches §Branding, not a defect).

### 12.6 Theme-default verification note

Re-confirmed, again, via direct `localStorage.getItem('mc_theme')` + `document.documentElement.classList.contains('dark')` checks on a genuinely fresh tab: light mode is the real default (`localStorage` reads `"light"`, html has no `dark` class, body background is `rgb(255,247,242)` = `#FFF7F2`). A dark-mode screenshot earlier in this same audit session was traced to a leftover manual theme-toggle click from a prior QA pass, not a site default — see [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md) for the full correction. This is at least the third time this exact confusion has been caught and corrected across this project's history; worth remembering for any future QA.

---

*Companion documents: [`BRENTIS_UI_REDESIGN_ANALYSIS.md`](./BRENTIS_UI_REDESIGN_ANALYSIS.md) (architecture), [`BRENTIS_SEO_GEO_AEO_STRATEGY.md`](./BRENTIS_SEO_GEO_AEO_STRATEGY.md) (content/technical SEO — several items above are explicitly deferred to that document), [`BRENTIS_IMPLEMENTATION_ROADMAP.md`](./BRENTIS_IMPLEMENTATION_ROADMAP.md) (execution plan), [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md) (tracker), [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md) (this addendum's source measurements).*
