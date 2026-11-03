# BRENTIS HEALTHCARE — Reference-Match Implementation Plan

**Status:** Blueprint for Prompt 2 of this 3-prompt workflow. **Nothing in this document has been implemented.** Sourced entirely from [`BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md`](./BRENTIS_BRINTONCARE_REVERSE_ENGINEERING.md), [`BRENTIS_REFERENCE_VS_CURRENT_COMPARISON.md`](./BRENTIS_REFERENCE_VS_CURRENT_COMPARISON.md), and [`BRENTIS_GUEST_CART_ARCHITECTURE.md`](./BRENTIS_GUEST_CART_ARCHITECTURE.md).

---

## A. Homepage Architecture (exact section order for Prompt 2)

The current BRENTIS homepage composition (built in the prior workflow) is **already brand-first and already enforces the one-product-row rule** — this plan does not re-run that restructure. It targets the three specific, confirmed structural gaps:

1. Header (unchanged)
2. Hero (unchanged — static, see §C for the staged carousel decision)
3. **About BRENTIS HEALTHCARE — rebuilt to the 5-unit layout (§D)**
4. Shop by Category (unchanged pattern; photography blocked on content, §E)
5. **Differentiation ("Why Choose BRENTIS") — rebuilt to an editorial image+list layout (§F)**, replacing the current generic 4-card grid
6. Selected Products — one row (unchanged, already correct, §G)
7. Healthcare Knowledge (unchanged)
8. Customer Trust (unchanged — real-reviews-or-honest-fallback already correct)
9. Newsletter (unchanged)
10. Footer — add payment-method icons only (§K)

## B. Section Specifications (summary — full detail in the reverse-engineering doc)

Reuse exact measured proportions from Brintoncare where a direct translation makes sense and doesn't require fabricated content:
- Section vertical rhythm: keep the existing `space-24`/`space-12` system (already correct per the prior workflow's Design System doc).
- Large editorial images: portrait orientation, ~410×490px equivalent at desktop, rounded corners (reuse existing `rounded-3xl` token).
- Pill buttons, pill category labels: already an established pattern in this codebase (`rounded-full`) — reuse, don't reinvent.

## C. Hero Slider Specification

**Decision: do not reintroduce `HeroCarousel` yet.** The static hero was built specifically to fix a real, confirmed bug (text baked into seeded banner images, duplicated by the carousel's own text overlay). Reintroducing a carousel without fixing the underlying asset problem would reintroduce the bug.

**Staged recommendation:**
1. Short term (this plan): keep the static hero exactly as-is.
2. When real, text-free photography exists for 2+ genuine promotions: reintroduce `HeroCarousel` (the component itself was never broken — only the content fed into it was) with:
   - Dot pagination only (Brintoncare's own confirmed pattern — no arrows were found in the accessible tree)
   - Content (image+heading+subcopy+CTA) changes as one unit per slide
   - A conservative, explicit interval (6000ms — the existing component's own documented default) rather than guessing at Brintoncare's actual, unverifiable timing
   - Hover-pause behavior (already implemented in the existing `HeroCarousel.tsx`, unchanged)

## D. About Section — 1 Image + 4 Blocks (the primary visual fix in this plan)

**Layout:** 2-column at `lg:` breakpoint (image left ~45%, blocks right 2×2 grid), stacking to image-above-blocks on mobile — matches the measured Brintoncare pattern exactly.

**Image composition:** one large portrait photo (reuse the existing, already-vetted Unsplash source already used in this codebase's About section, or a second one from the same source) — a literal overlapping 2-photo collage (as Brintoncare uses) is a nice-to-have, not required; a single strong image satisfies "one large image."

**Four blocks (content, verified-safe per the no-fabrication rule):**
1. **Our Core Values** — reuse existing, already-approved copy ("Quality & Trust" / sourcing claim).
2. **Our Vision & Mission** — **content gap: needs a real, business-authored one-sentence vision statement.** This plan must not write one on the business's behalf; placeholder language should visibly indicate "pending business input" if implemented before real copy exists.
3. **Our Commitment to Care** (replaces "International Presence" — no international operations exist for BRENTIS) — reuse existing, already-approved copy about prescription handling / GST-transparent checkout.
4. **Why Choose BRENTIS** — reuse existing, already-approved verified-sourcing/secure-checkout copy.

Each block: small line-icon (reuse the existing icon style already established — checkmark/lock/truck/Rx icons already built in the prior workflow's `WhyBrentisSection` are good candidates to redistribute here), bold heading, 1–2 sentence description, thin bottom divider.

## E. Category Section — Photographic Cards

**Current state is correct given available data** (icon+tint cards, documented reasoning). **Blocked on content:** real category photography must be sourced/uploaded via Admin before the Brintoncare-style full-bleed photographic card can be built honestly. This plan does not fabricate category photography. When real images exist: swap the icon+tint treatment for `object-cover` photography at the same ~283×395px (or responsive equivalent) proportions, pill label overlay at the bottom, 20px radius — all directly specified from the measured reference.

## F. Differentiation Section — Editorial Image + Content Layout

**This is a real rebuild**, not a content-only gap. Replace the current 4-card `WhyBrentisSection` grid with:
- 2-column layout: left = heading + 1 paragraph + a 4–5 item value/feature list (small icon + label, 2-column sub-grid), right = one large portrait photo (reuse an existing, already-vetted lifestyle photo source).
- The *content* of the 4 existing "Why BRENTIS" facts (Verified Sourcing, Secure Checkout, Tracked Delivery, Prescription-Aware) can be reused as the list items — only the **layout** changes from "4 equal cards" to "editorial text block + list + photo," not the underlying claims.

## G. Product Carousel — Exactly One Merchandising Section

**Already correctly implemented.** No structural change required. Optional enhancement (not required to meet the brief's hard rule): add category tabs above the row, reusing the real category data already fetched elsewhere on the page — genuinely more useful once the catalog has enough products per category to make tabs meaningful (currently many categories have only 1–2 products, per the prior workflow's catalog audit, which would make tabs feel sparse).

## H. Recognition/Trust Section

**Do not add a store-availability marquee or a press-logo strip.** No genuine store partnerships or press mentions exist for BRENTIS. This section is correctly absent and should remain absent until real information exists. If/when it does, the pattern to follow is documented in the reverse-engineering doc §F.

## I. Blog Section

No structural change required — current 3-card grid already matches the editorial intent. Revisit a carousel treatment only once the real blog catalog grows meaningfully beyond 5 posts.

## J. Social Section

**New section, but blocked on integration.** Real BRENTIS social URLs already exist (`Footer.tsx`). A live post-embed grid (Instagram-style) requires either a real Instagram Graph API integration or manually curated post links — neither exists today. **Recommendation: do not build a fake/placeholder post grid.** Document as a future integration requiring either API credentials (business-owned Instagram Business account + Graph API app) or a manual content-curation process.

## K. Footer

Add a payment-method icon row (Visa/Mastercard/UPI/netbanking — genuinely accepted via the existing Razorpay integration, a truthful addition) to the existing `Footer.tsx`. **Do not add** accreditation/certification badges. Wave-shaped top border: optional pure aesthetic, not required.

## L. Guest Shopping Architecture — Implementation Task Breakdown

From [`BRENTIS_GUEST_CART_ARCHITECTURE.md`](./BRENTIS_GUEST_CART_ARCHITECTURE.md), concrete tasks for Prompt 2:

| # | Task | Files | Risk |
|---|---|---|---|
| L1 | Add guest-cart-cookie issuance to a new small middleware/helper, wired into `cart.routes.ts` before the route handlers | `apps/api/src/modules/customers/cart.routes.ts`, new `guest-cart.middleware.ts` or similar | Low |
| L2 | Swap `cartRouter.use(requireAuth)` → `cartRouter.use(optionalAuth)` | `cart.routes.ts` | Low (reuses existing, proven middleware) |
| L3 | Refactor `cart.service.ts` functions to accept an owner-key (`{userId}` \| `{sessionId}`) instead of a bare `userId` string | `cart.service.ts`, `cart.controller.ts` | Medium — mechanical but touches every function; needs careful test coverage |
| L4 | Implement cart-merge on login/register success | `apps/api/src/modules/auth/*` (wherever login/register success is finalized), reusing `cart.service.ts` logic | Medium — must not block login on merge failure (§8.3 step 8 of the architecture doc) |
| L5 | Frontend: change `useCart()`'s `enabled: isAuthenticated` → `enabled: true` | `apps/web/src/modules/storefront/hooks/useCart.ts` | Low |
| L6 | Verify `withCredentials: true` already carries the new guest cookie (it should, no change expected, but confirm) | `apps/web/src/api/http-client.ts` | Verification only |
| L7 | Add/update backend tests per the 11 test cases in the architecture doc §13 | `apps/api/src/modules/customers/*.test.ts` | Required, not optional |

**Explicitly out of scope for L1–L7:** any change to `requireAuth`, `orderRouter`, `addressRouter`, payment verification, or any admin-consumed route.

## M. Responsive Specification

Reuse the existing, already-verified breakpoint set (1440/1280/768/390/360px, zero horizontal overflow — the bar every prior prompt in this project has held). Apply specifically to:
- New About 4-block grid: 2×2 desktop → stacked 2-column or 1-column mobile (match Brintoncare's confirmed mobile pattern: 2-column sub-grid, not full single-column).
- New Differentiation editorial layout: 2-column desktop → image-above-content stacked mobile (same pattern as the existing About section already uses today).

## N. Admin Protection Plan

**Unchanged boundary from every prior prompt in this project:**
- Protected, must not be touched: `apps/web/src/modules/admin/**`, `apps/web/src/modules/superadmin/**`, `apps/web/src/layouts/AdminLayout.tsx`, `SuperAdminLayout.tsx`, `apps/web/src/components/layout/Sidebar.tsx`, `Topbar.tsx`, `apps/web/src/components/common/**` (shared primitives — extend via new components/props only, per the established pattern from every prior prompt).
- Guest-cart backend changes (§L) touch only `apps/api/src/modules/customers/cart.*` and (for the merge step) the auth module's login/register success path — **no admin route consumes the cart API** (confirmed: cart is a customer-only concept throughout this codebase's dependency map). Backward compatible by construction (§11 of the architecture doc).

## O. Testing Plan

| Type | What to test |
|---|---|
| **Visual** | Re-screenshot the new About and Differentiation sections at all 5 breakpoints; confirm no horizontal overflow; confirm no duplicated/overlapping text anywhere (same bar as every prior prompt) |
| **Functional** | All 11 guest-cart test cases from the architecture doc §13; existing logged-in cart/checkout flows re-verified unchanged |
| **Security** | Confirm a forged/guessed guest cookie cannot access another session's cart (signed-cookie verification); confirm `requireAuth`-gated routes (`/orders`, `/addresses`) still reject guests exactly as before; confirm price is still always server-computed, never client-trusted, for guest adds |
| **Integration** | `typecheck`/`lint`/`build` pass; `docker compose config -q` + `build` pass for any service whose code changed (api, if L1–L4 are implemented); live guest-cart flow re-verified via the Browser tool exactly as the bug was reproduced in this prompt |

---

*This plan does not authorize implementation on its own — Prompt 2 executes it.*
