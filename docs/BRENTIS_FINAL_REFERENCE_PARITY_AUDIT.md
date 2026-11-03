# BRENTIS — Final Reference Parity Audit (Prompt 4)

**Status:** Evidence-based. Desktop/tablet numbers below are carried forward from the prior session's measured audit ([`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md), itself built from real `getBoundingClientRect()`/`getComputedStyle()` reads — cited, not re-fabricated) since those sections hadn't changed and re-measuring would reproduce identical numbers. **Mobile (390px) and tablet-category (768px) numbers are new this session** — Brintoncare's mobile composition had never been directly measured before, and Prompt 4 explicitly flags mobile as highest priority. All new numbers came from live `getBoundingClientRect()` reads and direct screenshots at the exact stated viewport, this session, via the Browser pane (`mcp__Claude_Browser__*`).

**Tooling note:** Chrome DevTools MCP remains uninstallable in this environment (confirmed again, see [`BRENTIS_BROWSER_TOOLING_VERIFICATION.md`](./BRENTIS_BROWSER_TOOLING_VERIFICATION.md) for the root cause) — the Browser pane's own DOM-inspection tools (`javascript_tool`, `read_page`, `computer`) were used instead, which provide the same `getBoundingClientRect()`/`getComputedStyle()` ground truth.

---

## 1. Header

| Viewport | Brintoncare | BRENTIS |
|---|---|---|
| 1440px | 79.2px, `fixed`, white | 66px, `sticky`, dark navy (deliberate brand choice, not a defect — see prior audit §A) |
| 390px | Compact: logo + search icon + cart icon(with count badge) + hamburger, no visible nav labels | Compact: logo + theme toggle + cart + avatar + hamburger — structurally equivalent |

**Verdict:** already matches structurally at both ends measured. No change made this session.

## 2. Hero

| Viewport | Brintoncare | BRENTIS |
|---|---|---|
| 1440px | Swiper 3D carousel, 1440×473px, dot pagination only | `HeroCarousel`, full-bleed, dot pagination + prev/next arrows |
| 390px | Full-bleed product photo, CTA pill overlay, dot pagination, **no heading text on image itself** (text-free slide) | Full-bleed photo, badge + heading + subtitle + CTA overlay text |

**Verdict:** structurally equivalent, real working carousel on both. No change made.

## 3. About Us

| Metric | Brintoncare (1440px, prior measurement) | BRENTIS (1440px) | Brintoncare (390px, measured this session) | BRENTIS (390px) |
|---|---|---|---|---|
| Image count | 1 real photograph (990×1190 natural, 409×492 rendered) + 2 decorative SVG accents | 1 real photograph | 1 photograph (187×225 rendered at this viewport, same DOM-confirmed single `<img>`) | 1 photograph |
| Info blocks | 4, 2×2 grid, icon+heading+description+divider | 4, 2×2 grid, same pattern | 4, 2×2 grid (stays 2-column even on phones, confirmed) | 4, 2×2 grid (unchanged this session) |
| Mobile stacking order | Heading → squiggle accents → photo → 2×2 blocks | **Was: photo → heading → blocks** (DOM order mismatch) | — | **Fixed this session**: heading/copy now renders before the image on mobile/tablet via `order-1`/`order-2` + `lg:order-*`, matching the reference's reading order; desktop keeps the image-left/text-right split |
| Mobile image height | Compact, bounded (not full-viewport) | Was `h-72` (288px) | — | Tightened to `h-56` (224px) mobile / `h-80` (320px) tablet, `gap-10`→`gap-6` mobile section gap |

**Verdict:** structural composition (1 photo + 4-block 2×2 grid) already matched; this session fixed the **mobile stacking order** (a real, previously-unmeasured gap) and tightened vertical spacing.

## 4. Shop by Category — the main finding this session

| Metric | Brintoncare @1440/1280/768 | Brintoncare @390 (measured this session) | BRENTIS (before) | BRENTIS (after) |
|---|---|---|---|---|
| Arrangement | Single row, 4 across | **2-column CSS grid**, NOT a horizontal scroll | Horizontal scroll-snap row at ALL breakpoints including mobile | **Horizontal scroll row ≥640px (`sm:`); 2-column CSS grid <640px** |
| Card size @1440 | — | — | 328×458px (prior measurement) | Unchanged (desktop) |
| Card size @390 | — | **174×242px** (measured, 2 per row, 7px gaps both axes) | ~46%-width flex item in a horizontal scroller | `grid-cols-2`, each cell sized by the grid, same `aspect-[283/395]` ratio as desktop |
| Aspect ratio @390 | — | 174:242 = **0.719** | n/a (was flex, not aspect-locked the same way) | `aspect-[283/395]` = **0.716** — matches the reference's own ratio, confirmed consistent across breakpoints on both sites |
| Card count @768 (tablet) | 4 across, single row (measured this session: 169×236px cards) | — | 4 across (unchanged) | 4 across (unchanged — `sm:` breakpoint is 640px, so 768px already gets the row layout) |

**This was the single most concrete, actionable finding of this prompt**: Brintoncare does NOT horizontally scroll its category tiles on mobile — it switches to a compact 2-column grid, with the exact same card proportions as desktop. BRENTIS previously forced the desktop horizontal-scroll pattern onto every breakpoint. **Fixed**: `CategorySection` in `HomePage.tsx` now renders `grid grid-cols-2` below `sm:` and the existing horizontal scroll row at `sm:` and above — confirmed live via screenshot (see `BRENTIS_FINAL_VISUAL_QA.md`).

## 5. Values / Differentiation

Unchanged from the prior audit's finding: structurally already matches (heading + paragraph + list on left, 1 large photo on right, stacks photo-above-text on mobile). No new issue found at 390px this session; no change made.

## 6. Best Sellers — category-wise navigation (new feature this session)

| Metric | Brintoncare (measured, prior + this session) | BRENTIS (before) | BRENTIS (after) |
|---|---|---|---|
| Tabs | 5: Sun Care / Anti-Ageing / Emollients / Skin Brightening / Hair Care (confirmed via DOM text this session, `role`-less `<li>` tab strip) | **None — single static product row, no category navigation** | **4 tabs: Pain Relief & Fever / Vitamins & Supplements / Personal Care / Wellness & Heart Health** — real, existing BRENTIS catalog categories (never Brintoncare's skincare taxonomy, which this catalog doesn't sell) |
| Default-active tab | First tab (Sun Care) | n/a | First tab (Pain Relief & Fever), admin-configurable (first category in the ordered `categoryIds` list) |
| Products per tab | 4 visible, carousel arrows, "View All" link | 4, static | 4 visible (desktop row / mobile horizontal scroll), "View all" link — switches instantly on tab click, confirmed live |
| Admin control | n/a (not applicable, reference site) | n/a — section didn't exist | New `category_tabs` HomeSection type: admin picks categories/order/visibility at `/admin/cms/home-sections`; products always resolved live from the real catalog (never duplicated), price/stock always authoritative |
| Mobile behavior | Only the active category's products shown; switching categories replaces the visible set | n/a | Only the active tab's products render (inherent to the tab pattern — no vertical stacking of every category) |

**Verdict:** this was a genuinely missing feature (Prompt 4 §7), now implemented end-to-end (model → validator → public API → admin UI → storefront) and live-verified by clicking between tabs and confirming the product list actually changes (Ibuprofen/Paracetamol under "Pain Relief & Fever" → Vitamin C/Multivitamin under "Vitamins & Supplements").

## 7. Blog

Unchanged this session — already dynamic (`listPublicBlogs`), already a compact 3-card grid at desktop and scroll-friendly at mobile (not independently re-measured against Brintoncare's own blog carousel this session; no complaint was raised against it in live testing).

## 8. Footer

Unchanged this session — already dynamic via the Configuration 'cms' namespace (Prompt 3), already compact at mobile (standard 2-column stack, not re-measured pixel-by-pixel this session since no visual issue was observed).

## 9. Recognition / press logos, social section

No change — correctly absent on BRENTIS, since no real press coverage or Instagram integration exists to show (same conclusion as the prior audit; fabricating either would violate the no-fabrication rule).

---

## Summary of changes made this session

1. **Category section**: mobile (<640px) switched from horizontal-scroll to 2-column grid, matching Brintoncare's measured mobile behavior exactly; card aspect ratio standardized to `283:395` across all breakpoints.
2. **About section**: mobile/tablet stacking order fixed (text before image, matching the reference's reading order); mobile image height tightened (288px→224px) and section gap tightened (40px→24px).
3. **Best Sellers**: new category-tab navigation feature built end-to-end, replacing the previous single static product row — directly implements the reference's tested tab pattern using BRENTIS's own real catalog categories.

## Known residual gaps (disclosed, not fixed this session)

- Blog and Footer mobile layouts were not independently re-measured against Brintoncare's own mobile blog carousel/footer — no issue was visually observed, but this is an assumption, not a measured confirmation, and is flagged honestly rather than claimed as verified.
- Tablet (768px) was only spot-measured for the category section (confirmed single-row, unchanged) — not every section was re-measured at 768px this session; desktop (1440/1280) numbers are carried forward from the prior session's audit, not re-captured fresh.
