# Brintoncare Reference vs. Current BRENTIS Homepage — Evidence-Based Comparison

**Status:** Research only, no code changed. Every "Current implementation" entry below reflects the actual BRENTIS homepage as it exists right now at `http://localhost:5173` (built across the prior 6-prompt workflow), verified live in this session. Every "Reference behavior" entry is sourced from [`BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md`](./BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md).

| Section | Reference behavior (Brintoncare) | Current implementation (BRENTIS) | Exact required correction |
|---|---|---|---|
| **Header** | White bg, 79px tall, fixed, SVG logo 118×39px, horizontal text nav, pill search | Dark `bg-ink`, sticky, text wordmark + heart icon, horizontal nav, pill search | **No correction needed structurally.** Color is a deliberate brand choice (dark navy chrome), not a defect — already matches the layout pattern (logo → search → nav → account/cart). |
| **Hero** | Full-bleed photographic carousel, 6 slides, text overlaid on image, 1 heading only per slide | Static single hero, text beside (not over) a photo, exact specified copy | **Gap:** no carousel/rotation exists. This is intentional (built specifically to eliminate a confirmed real text-duplication bug caused by seeded banner images with text baked into the pixels — see prior workflow's Prompt 6). **Correction:** keep static until real, text-free rotating promotional photography exists (see implementation plan); do not reintroduce a carousel against broken seed data. |
| **About Us** | **1 large image collage + 4 info blocks**, side-by-side at desktop | 1 image + 2 paragraphs of prose, **no 4-block grid at all** | **Real gap, must fix.** Current About section is image + text paragraphs only — the "5 visual units" (1 image + 4 labeled blocks) pattern is entirely missing. This is the single most concrete structural correction in this whole comparison. |
| **Categories** | 4 large (283×395px) **photographic** cards, pill label overlay | 8 cards, icon-in-circle (not photography), name label below | **Gap:** category cards use icons, not photography, because **no real category photography exists in the BRENTIS catalog data** (confirmed: `Category.imageUrl` unset on every seeded category). The icon treatment was a deliberate, documented choice in the prior workflow specifically to avoid inventing fake photography. Correction is a content dependency, not a code defect — see implementation plan. |
| **Differentiation / Why Choose Us** | Editorial 2-column: text+5-item list **+ one large photo** | 4-card icon grid, **no photo, no editorial layout** | **Real gap, must fix.** Current "Why BRENTIS" section is a generic 4-card grid, structurally identical to a dozen other sections on the page — Brintoncare's equivalent is a distinct, editorial, image-led layout. This is exactly the "another generic grid of small cards" problem the brief explicitly warns against. |
| **Store/Recognition strips** | 2 strips: store-availability marquee + press-logo strip (Forbes, GQ, etc.) | **Neither exists** | **Correct as-is — do not add.** No genuine store partnerships or press recognition exist for BRENTIS. Omission is the right call, not a gap. |
| **Product carousel** | Tabbed-by-category, 4-across, rating badge, "View Options" | Single static row, 4 products, no tabs, "Add to cart"/"Buy now" | **Partial match.** The "exactly one merchandising section, ~4 products, one row" rule is already correctly implemented. Missing: category tabs (reference has them; current doesn't). Minor, not a core defect — the one-section rule (the explicit hard requirement) is already satisfied. |
| **Blog** | Horizontal carousel, 3 visible of more, prev/next arrows | Static 3-card grid, no carousel | **Minor gap.** BRENTIS only has 5 real seeded posts total — a carousel over 5 items has limited value today. Structural pattern (photo + category tag + title) already matches. Not urgent. |
| **Social section** | Real Instagram post grid (9 embedded posts) | **Does not exist** | **Gap, but blocked by missing integration.** Real social URLs exist (Footer), but no live post-embed mechanism (Instagram Graph API or manual curation) exists in this project. Flagged as a future integration, not fabricable now. |
| **Footer** | Green bg, wavy top border, payment icons, accreditation badges, 2026 copyright | Dark bg, straight edge, **no payment icons**, no accreditation badges, real copyright | **Minor gap:** payment-method icons (Visa/Mastercard/UPI/Razorpay-supported methods) are a reasonable, truthful addition (describes real accepted payment methods). **Do not add** accreditation badges — no real BRENTIS accreditation exists. Wave-shaped border is a pure aesthetic choice, optional. |
| **Overall page density** | 10 sections, 5 of them brand/trust/editorial before the first product row | 9 sections, already restructured in the prior workflow to be brand-first (Hero→About→Categories→Values→**1 product row**→Blog→Why→Trust→Newsletter) | **Already substantially aligned** — the prior workflow's "homepage design reset" (its own Prompts 5–6) already corrected the product-catalogue problem this new workflow is also concerned about. The remaining gaps are the specific ones listed above (About's missing 4-block grid, Why-BRENTIS's missing editorial layout, Categories' missing photography), not a re-run of the whole restructure. |
| **Theme default** | Clean white/off-white throughout | **Light theme is already the real default** (`ThemeContext.tsx`'s `getInitialTheme()` falls back to `'light'`, verified in the prior workflow by clearing a stale `localStorage['mc_theme']` and reloading) | **No correction needed.** Any dark appearance observed in prior screenshots was leftover manual-testing state, not the actual default — already documented and re-verified. |

## Missing Sections (confirmed absent from current BRENTIS homepage)
1. The 4-block "Core Values / Vision & Mission / [replacement] / Why Us" info grid within About.
2. An editorial, image-led Differentiation section (current "Why BRENTIS" is a generic card grid instead).
3. Category tabs on the product section (minor).
4. A real social-post embed section (blocked on integration/content, not a code gap).
5. Payment-method icons in the footer.

## Sections Correctly Present (no correction needed)
- Single product-merchandising-section rule — already enforced.
- No store/press recognition claims — correctly absent.
- No fabricated testimonials — `CustomerTrustSection` already has a real-reviews-or-honest-fallback branch.
- Light theme as default — already correct.
- Brand-first section ordering — already substantially restructured from the old catalogue-style layout.

## Unnecessary / Product-Heavy Patterns (confirmed NOT present — already fixed)
The original "product catalogue" complaint from the prior workflow (3+ product grids: New Arrivals, Popular Products, admin HomeSections, Recently Viewed) was already resolved in that workflow's Prompt 6. This comparison found no regression — still exactly one product section.

---

*Companion documents: [`BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md`](./BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md), [`BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md`](./BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md).*
