# BRENTIS HEALTHCARE — Implementation Roadmap

**Status:** Originally a Prompt 2 planning deliverable. Task-by-task completion is still tracked live in [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md) (the authoritative, dated log) — this doc's tables below are not individually checked off to avoid drift between two sources of truth. This note summarizes verified completion status as of Prompt 4.

Each task: **Priority** (P0 blocking / P1 high / P2 medium / P3 low) · **Description** · **Affected files/modules** · **Dependencies** · **Acceptance criteria** · **Risk**.

## Completion status as of Prompt 4 (verified, not just planned)

**Done:** 1.1 (tokens), 1.3/1.4 (Header/Footer), 1.5 (ThemeToggle), 1.6 (Homepage polish), 1.7 (PLP), 1.8 (PDP), 1.9 (Cart), 1.10 (Checkout), 1.14 (breadcrumbs), 1.15 (dynamic PLP title/H1), 3.1/3.2/3.8 (SEO: H1, dynamic meta, URL pagination — PLP + Blog list), 3.9 (Blog→BlogPosting), 4.1 (Organization/WebSite schema), 9.1/9.2 (lint/typecheck/build pass), 9.5 (responsive QA at all 5 breakpoints, zero overflow), 10.1 (Docker dev compose).

**Partially done / lighter touch than full "redesign":** 1.11 (About/Contact/Blog/FAQ/Offers/policy pages got breadcrumb + token-consistency + typography fixes, not full layout rework), 1.2 (logo — still a text wordmark, no derived graphical asset), 2.1 (Card/Badge token leak — re-assessed as narrower than originally scoped, not forked — see Progress doc).

**Not started:** 1.12/1.13 (Login/Register page content, Account area — deliberately deferred, see Progress doc's admin-protection note), 2.2–2.9 (new component library beyond what PLP/PDP/Cart needed), 3.3 (admin SEO config wiring — needs backend endpoint), 3.5/3.6 (category-page routing decision + dependent schema wiring — blocked on a product decision), 3.4/3.7/3.10, 4.2–4.4, 5.*, 6, 7.*, 8.*, 9.3/9.4/9.6-9.8 (admin smoke test needs real staff login; payment smoke test needs Razorpay test-mode run; theme/reduced-motion QA spot-checked but not exhaustive), 10.2/10.3.

---

## 1. Frontend Redesign

| # | Priority | Description | Affected files | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|
| 1.1 | P0 | Add typography/spacing/radius/shadow design tokens | `apps/web/tailwind.config.js`, `apps/web/src/styles/index.css` | Design System doc §2–3 | New tokens present and additive; `brand-*` (admin) tokens untouched; existing storefront pages still render correctly | Low |
| 1.2 | P0 | Resolve logo asset for header/footer use | `newLogo.jpeg` (read-only), new derived asset under `apps/web/public/` | User decision on tagline discrepancy (Analysis doc §11) | Header/footer render a legible BRENTIS mark at ~36–48px without distortion; original `newLogo.jpeg` untouched | Low |
| 1.3 | P0 | Rebrand Header component | `apps/web/src/components/layout/Header.tsx` | 1.1, 1.2 | New nav structure, search, account/cart, sticky+glass-on-scroll behavior, mobile hamburger at `md` breakpoint; existing auth/cart logic untouched | Medium (high-visibility, shared-nothing with admin — confirmed safe in Analysis doc §5) |
| 1.4 | P0 | Rebrand Footer component | `apps/web/src/components/layout/Footer.tsx` | 1.1, 1.2 | Sitemap/newsletter/contact/social/payment-badge sections per Design System §7; real CMS-driven content preserved, no copied Brintoncare decorative elements | Low |
| 1.5 | P0 | Fix `ThemeToggle` | `apps/web/src/components/layout/ThemeToggle.tsx` | 1.1 | SVG icons replace emoji, uses semantic tokens; verified not to visually break admin `Topbar.tsx` usage | Medium (shared with admin — visual-only change, verify both surfaces) |
| 1.6 | P1 | Homepage redesign | `apps/web/src/modules/storefront/pages/HomePage.tsx` + new components (1.x below) | 1.1–1.5 | Hero with real `<h1>`, trust strip, category section, bestsellers, Bento values section, testimonials (real content only), blog teaser, matches Design System §6.1 | Medium |
| 1.7 | P1 | Product Listing Page redesign | `ProductListPage.tsx`, `Pagination.tsx`, filter sidebar | 1.1 | Filters/sort preserved functionally, dynamic title/H1/meta per filter (fixes SEO doc §1.2/§1.3), URL-synced pagination (fixes SEO doc §1.10) | Medium |
| 1.8 | P1 | Product Detail Page redesign | `ProductDetailPage.tsx` | 1.1 | Gallery, variant selector, sticky CTA pair, specs from real `medicine.*` fields only, related products — functionality (cart/wishlist/reviews) preserved | Medium |
| 1.9 | P1 | Cart page redesign | `CartPage.tsx` | 1.1 | Line items, coupon, summary, empty state — cart/coupon logic untouched | Low |
| 1.10 | P1 | Checkout page redesign | `CheckoutPage.tsx` | 1.1 | Address/payment/confirmation flow visually restyled only; Razorpay widget, GST calc, COD, GA4 events all untouched and re-verified | **High** (payment-critical path — see Testing §9) |
| 1.11 | P2 | Content pages (About, Contact, Blog list/detail, Offers, FAQ, policies) | respective page files | 1.1 | Visual consistency with design system; CMS-driven content rendered faithfully, no invented copy | Low |
| 1.12 | P2 | Login/Register page restyle | `apps/web/src/modules/auth/pages/*` | 1.1 | **Verify admin Google-OAuth login still works** (Analysis doc §5 flags this file as dual-use) | Medium (shared with admin login) |
| 1.13 | P2 | Account pages restyle | `apps/web/src/modules/customer/pages/*` | 1.1 | Consistent component reuse, no new patterns (Design System §6.10) | Low |
| 1.14 | P1 | Breadcrumb integration on storefront | `PublicLayout.tsx` or per-page, reusing `components/layout/Breadcrumb.tsx` | 1.1 | Breadcrumbs visible on PLP/PDP/blog detail; verify no visual regression on admin/customer-account `Topbar` usage of the same component | Medium (shared component) |
| 1.15 | P1 | Add `<h1>` to HomePage; dynamic PLP title/H1 | `HomePage.tsx`, `ProductListPage.tsx` | 1.6, 1.7 | Matches SEO doc §2 items 1, 6 | Low |

---

## 2. Component Development

| # | Priority | Description | Affected files | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|
| 2.1 | P0 | Decide + implement shared-primitive strategy for `Card`/`Badge` token leakage | `components/common/Card.tsx`, `Badge.tsx` or new storefront-scoped wrappers | Analysis doc §13 decision | Admin's existing Card/Badge usage visually unchanged; storefront gets on-brand tokens | **High if done wrong** — must verify admin screens after any shared-file edit |
| 2.2 | P1 | New: Hero component (single statement, one load-in animation) | `modules/storefront/components/Hero.tsx` | 1.1 | Matches Design System §6.1.1 | Low |
| 2.3 | P1 | New: Trust badge strip | `modules/storefront/components/TrustBadges.tsx` | SEO/Trust doc §6 (real claims only) | Renders only real, substantiated claims from CMS/config | Low |
| 2.4 | P1 | New: Bento "Why BRENTIS" grid | `modules/storefront/components/ValuesBento.tsx` | 1.6 | Used once (homepage only), per Design System §1 restraint principle | Low |
| 2.5 | P1 | New/extend: Category chip, tabbed bestseller carousel | `modules/storefront/components/*` | real category API | Pulls from `listCategoryTree()`, not hardcoded categories | Low |
| 2.6 | P2 | New: Testimonial card | `modules/storefront/components/Testimonial.tsx` | Real CMS testimonial content (none invented) | Renders empty/hidden state gracefully if no real testimonials exist yet — **never placeholder/fake testimonials** | Low |
| 2.7 | P1 | Extend `ProductCard` for new visual spec | `modules/storefront/components/ProductCard.tsx` | 1.1, 2.1 | Rating, price/discount only from real data, wishlist, variant-aware "View Options" | Medium |
| 2.8 | P1 | Variant/size pill selector (PDP) | `modules/storefront/components/VariantSelector.tsx` (new) or extend PDP inline | 1.8 | Matches existing variant/price data model exactly | Low |
| 2.9 | P2 | Loading skeletons / empty states / error states for search & PLP | `components/common/Skeleton.tsx` (reuse), new storefront empty-state illustration component | SEO doc search requirements | Debounced search states all covered per Prompt 3 §Search | Low |

---

## 3. SEO Implementation

| # | Priority | Description | Affected files | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|
| 3.1 | P1 | Add `<h1>` to Homepage | `HomePage.tsx` | — | Confirmed via DOM inspection | Low |
| 3.2 | P1 | Dynamic PLP title/description/H1 per filter | `ProductListPage.tsx` | — | Title reflects selected category/brand/search term | Low |
| 3.3 | P1 | Wire admin SEO config (`siteTitle`/`siteDescription`/OG) into storefront `useDocumentMeta` defaults | `useDocumentMeta.ts`, possibly a new public read endpoint for `SeoConfig` subset | Backend confirms `/admin/seo/config` is admin-only; new public endpoint needed if so | Admin-edited Site Title actually changes rendered `<title>` | Medium (may need backend endpoint) |
| 3.4 | P2 | Add `meta[robots]`/noindex support to `useDocumentMeta`; apply to `NotFoundPage`, `SearchResultsPage` meta (set title at minimum) | `useDocumentMeta.ts`, `NotFoundPage.tsx`, `SearchResultsPage.tsx` | — | 404 page sets title + noindex meta | Low |
| 3.5 | P1 | Resolve category-page / sitemap mismatch (SEO doc §3 decision) | `AppRouter.tsx` (new route) or `sitemap.routes.ts` (stop emitting) | User/product decision on which path | No sitemap URL 404s | Medium (routing decision + backend) |
| 3.6 | P2 | Wire `buildCategoryStructuredData()` | `apps/api/src/modules/catalog/category.service.ts` or equivalent route | 3.5 (if category pages are built) | CollectionPage JSON-LD present on category pages | Low |
| 3.7 | P2 | Add `Organization` + `BreadcrumbList` structured data | New `structured-data.util.ts` builders + frontend injection | Real NAP data (§9 of SEO doc) | Valid schema.org markup, passes Google Rich Results Test | Low |
| 3.8 | P1 | URL-sync pagination (`?page=`) | `ProductListPage.tsx`, `SearchResultsPage.tsx`, `BlogListPage.tsx`, `Pagination.tsx` | — | Page 2+ reachable via real `<Link>`, bookmarkable | Medium |
| 3.9 | P2 | Replace inline Blog `Article` JSON-LD with shared `BlogPosting` builder | `BlogDetailPage.tsx`, `structured-data.util.ts` | — | Single source of truth for blog schema | Low |
| 3.10 | P3 | Static 404 HTTP status mitigation | `infra/nginx/conf.d/spa.conf` (documented limitation, not a full fix — see SEO doc §7) | — | Documented honestly; `NotFoundPage` noindex is the primary real mitigation | Low |

---

## 4. GEO/AEO Implementation

| # | Priority | Description | Affected files | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|
| 4.1 | P2 | `Organization` entity schema (brand consistency) | shared with 3.7 | Real NAP | One consistent brand entity across site | Low |
| 4.2 | P3 | Evaluate/draft optional `llms.txt` | `apps/web/public/llms.txt` | Real, factual content only | Short factual summary, no promised ranking/citation claims | Low |
| 4.3 | P2 | Question-based headings on FAQ/category intro content | CMS content (admin-authored), `FaqPage.tsx` | Real content from business | Only where a genuine question exists | Low |
| 4.4 | P3 | Category FAQ schema (reuse existing `Category.faq[]`) | Category admin form (already exists) + storefront rendering once category pages exist | 3.5 | Real admin-authored FAQs only | Low |

---

## 5. Backend/API Work

| # | Priority | Description | Affected files | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|
| 5.1 | P2 | Public read-only SEO-config endpoint (if needed for 3.3) | new route in `apps/api/src/modules/search/` | Confirm current `/admin/seo/config` auth requirement first | Returns only the public-safe subset (siteTitle/description/OG), no admin-only fields leaked | Low |
| 5.2 | P2 | `buildCategoryStructuredData()` wiring | `apps/api/src/modules/catalog/category.service.ts` | 3.5 | Unit test extended to cover the route-level call, not just the builder | Low |
| 5.3 | P3 | `Organization` structured-data builder | `apps/api/src/modules/search/structured-data.util.ts` | Real NAP | Unit tested like existing builders | Low |
| 5.4 | P3 | `BreadcrumbList` structured-data builder | same file | 1.14 | Unit tested | Low |

All backend work **must not modify any admin route, admin auth, or existing public API contract** — strictly additive endpoints/fields.

---

## 6. Database Changes

**None required for the core redesign.** Everything above reuses existing fields (`seo.metaTitle/metaDescription/canonicalUrl` on Product/Category, `faq[]`, `authorId`, etc.). The only *possible* future addition — a structured NAP/business-identity field set, if the business wants it DB-managed rather than hardcoded in `Footer.tsx`'s existing pattern — is explicitly **not scoped into Prompt 3** and requires separate user sign-off before any schema change, per the project's backend-change policy.

---

## 7. Content Improvements

| # | Priority | Description | Dependencies | Acceptance criteria | Risk |
|---|---|---|---|---|---|
| 7.1 | P0 | Replace placeholder NAP on `ContactPage.tsx` (`support@medcommerce.example`, `+91 1800-000-000`, generic address) | Real values from the business — **cannot be fabricated by this project** | Real, verifiable contact info displayed | None (content-only) once real data is supplied |
| 7.2 | P1 | Real (non-demo) policy page content (Privacy/Terms/Return/Shipping/Cancellation/Refund) | Business/legal sign-off | CMS-entered, accurate for India pharmacy e-commerce | None (content-only) |
| 7.3 | P2 | Real category/product/blog content replacing demo-content shape | Business catalog data | No literal demo product names/descriptions in production | None (content-only) |
| 7.4 | P3 | Genuine educational blog content with real sourcing | Editorial process | No thin/duplicated/fabricated medical content | Content-quality risk if rushed |

---

## 8. Performance

| # | Priority | Description | Affected files | Acceptance criteria | Risk |
|---|---|---|---|---|---|
| 8.1 | P1 | Replace 2.28MB logo/OG image with optimized asset | ties to 1.2 | New asset <100KB, served in modern format | Low |
| 8.2 | P1 | Two variable font files only, `font-display: swap` | `index.html` or `index.css` `@font-face` | No FOIT, LCP not blocked | Low |
| 8.3 | P2 | Explicit image dimensions / lazy loading audit across new components | all new storefront components | No CLS from images | Low |
| 8.4 | P2 | Verify no new heavy dependency introduced | `package.json` diff | Only `framer-motion` (already present) used for motion | Low |

---

## 9. Testing

| # | Priority | Description | Acceptance criteria | Risk |
|---|---|---|---|---|
| 9.1 | P0 | Lint + typecheck + build (`apps/web`) | Zero new errors | Low |
| 9.2 | P0 | Existing unit/integration tests still pass (`apps/api`, `apps/web` if any) | No regressions | Low |
| 9.3 | P0 | Admin panel manual smoke test after any shared-component change (Button/Card/Badge/ThemeToggle/Breadcrumb) | Admin visually and functionally unchanged | **High** if skipped |
| 9.4 | P0 | Checkout/payment flow smoke test against Razorpay **test mode only** | Real test-mode payment completes; **never simulate success without going through the real widget/verification** | **High** |
| 9.5 | P1 | Responsive QA at 1440/1280/768/390/360px | No overflow/overlap/broken images/clipped text (Prompt 3 §8 checklist) | Medium |
| 9.6 | P1 | Light/dark theme QA on every redesigned page | Correct tokens in both modes | Low |
| 9.7 | P2 | `prefers-reduced-motion` verification | All motion disabled/reduced correctly | Low |
| 9.8 | P1 | Docker Compose config validation + build + up + health checks | Per Prompt 3 §9/§14 — see Docker doc | Medium (external dependency availability) |

---

## 10. Deployment

| # | Priority | Description | Acceptance criteria | Risk |
|---|---|---|---|---|
| 10.1 | P2 | Local Docker Compose dev setup (frontend + API, external Atlas/Redis) | Documented in `BRENTIS_DOCKER_LOCAL_DEVELOPMENT.md` | Medium |
| 10.2 | P3 | Staging deployment verification | Out of scope for Prompt 3 unless explicitly requested | — |
| 10.3 | P3 | Production deployment | **Explicitly out of scope** — no commit/push without permission (project-wide rule) | — |

---

## Sequencing Note

This roadmap's Section 1/2 ordering matches Prompt 1 analysis doc §18's recommended sequence (tokens → logo → shared-primitive decision → Header/Footer → Homepage → PLP/PDP/Cart/Checkout → remaining pages). SEO (Section 3) items 3.1/3.2/3.8/1.14 are interleaved into the same page work (not a separate pass) since they're small, page-local changes — consistent with Prompt 3's own instruction to lay SEO *foundations* now rather than defer everything to Prompt 4.

---

*Companion documents: [`BRENTIS_UI_REDESIGN_ANALYSIS.md`](./BRENTIS_UI_REDESIGN_ANALYSIS.md), [`BRENTIS_DESIGN_SYSTEM.md`](./BRENTIS_DESIGN_SYSTEM.md), [`BRENTIS_SEO_GEO_AEO_STRATEGY.md`](./BRENTIS_SEO_GEO_AEO_STRATEGY.md), [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md).*
