# BRENTIS HEALTHCARE — SEO / GEO / AEO Strategy

**Status:** Prompt 2 deliverable, completed during Prompt 3 (the backend audit agent hadn't returned when Prompt 3 began — see [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md) for the timeline note). Strategy only — nothing in this document has been implemented yet except where explicitly marked.
**Scope:** Public-facing customer storefront only.
**Evidence sources:** Direct repo inspection (this session) + a dedicated backend/frontend SEO audit (Explore agent, 61 tool calls) + a dedicated catalog/business-info audit (Explore agent, 26 tool calls). Every claim below is evidence-backed with a file path; nothing is assumed.

---

## 0. Critical correction to Prompt 1's assumptions

Prompt 1's analysis doc did not deeply audit `apps/api/src/modules/search/` or `apps/api/src/modules/sitemap/`. Fresh inspection in this prompt found **KarienLabs already has a comprehensive, admin-configurable SEO/AEO/GEO engine** — this is not a greenfield SEO build. The real work is: fixing specific confirmed gaps, wiring up dead/unused code paths, and adding the missing frontend foundations (H1s, breadcrumbs) — not building sitemap/robots/structured-data infrastructure from scratch.

**Also critical:** the real product catalog (via demo-content migration, the only structured catalog evidence in the repo) is an **India OTC + prescription pharmacy** — categories: Pain Relief & Fever, Vitamins & Supplements, Diabetes Care, Digestive Health, Allergy & Cold, Personal Care, Wellness & Heart Health, Baby & Mother Care. Some demo products include Schedule H drugs (Metformin, Glimepiride) with prescription requirements. This is **not** a skincare/cosmetics brand like the Brintoncare reference — it is a higher-stakes YMYL (Your Money or Your Life) medical commerce site. Every recommendation below is calibrated to that reality, not to Brintoncare's category.

---

## 1. Current SEO Audit (evidence-based)

### 1.1 Rendering strategy — confirmed CSR-only
`apps/web` is a pure Vite + React SPA. No SSR/SSG/prerender tooling exists anywhere in the dependency tree (`apps/web/package.json`), `vite.config.ts` has no SSR config, and both `vercel.json` files are static-rewrite only. The codebase's own comment in `useDocumentMeta.ts` (lines 34–40) already states this plainly: *"this app is CSR, not SSR/SSG, so search engines that don't execute JS won't see these tags on first paint... A true SEO fix would move rendering to Next.js or add a prerender step — out of scope."* This is the single biggest structural SEO constraint and shapes every recommendation below (we work within CSR rather than assume SSR is coming).

### 1.2 Title tags, meta descriptions, canonical — mechanism exists, coverage has gaps
- `apps/web/src/hooks/useDocumentMeta.ts` is a bespoke hook (no `react-helmet-async`) that sets `document.title`, `meta[description]`, OG tags, Twitter Card tags, and `<link rel="canonical">` — all client-side, post-render.
- **Static `index.html`** (what any non-JS-executing crawler or unfurler actually sees first) has only `<title>KarienLabs</title>` and no description/OG/Twitter/canonical at all.
- Called on most public pages (Home, PLP, PDP, Blog list/detail, FAQ, CMS pages, Contact, Brands, Manufacturers, Offers, Bulk Purchase). **Not called on `SearchResultsPage.tsx`** (a real, crawlable `/search?q=` URL) or `NotFoundPage.tsx`.
- No `noindex`/robots-meta capability exists in the hook's interface at all — there is currently no way for any page to self-declare `noindex`.
- **Dead admin config:** the Super Admin's SEO Settings page (`siteTitle`, `siteDescription`, `defaultOgImage`) and the CMS Site Settings page (`seo.defaultMetaTitle/Description/OgImage/titleSuffix`) are both stored but **never read by the storefront** — the hook hardcodes `SITE_NAME = 'KarienLabs'` instead. An admin editing either settings screen today has zero visible effect.
- `ProductListPage.tsx` passes a **static** title/description/`<h1>` ("Products") regardless of the active category/brand/search filter — filtered URLs that genuinely exist (`?categoryId=X`) are not differentiated in their metadata.

### 1.3 Heading hierarchy — confirmed gap on the homepage
| Page | `<h1>` | Note |
|---|---|---|
| HomePage | **0 found** | No `<h1>` anywhere on the single most important page of the site. |
| ProductListPage | 1, hardcoded "Products" | Doesn't reflect active filter. |
| ProductDetailPage | 1, dynamic `{product.name}` | Correct. |
| BlogListPage / BlogDetailPage | 1 each | List is static; detail is dynamic (`{blog.title}`), correct. |

### 1.4 Image alt attributes — good, no action needed
`ProductCard.tsx` and `ProductDetailPage.tsx` consistently use descriptive, product-name-based `alt` text (not generic placeholders), with `loading="lazy"` already applied on grid images. No changes needed here.

### 1.5 URL structure — one real route/sitemap mismatch, no SEO-friendly category URLs
Confirmed routes (`AppRouter.tsx`): `/`, `/products` (filtered via query params), `/products/:id` (accepts slug or Mongo ID), `/search`, `/blog`, `/blog/:slug`, `/about`, `/contact`, `/bulk-purchase`, `/faq`, 6 policy pages, `/offers`, `/brands`, `/manufacturers`, `/page/:slug` catch-all. **No `/categories/:slug` route exists** — yet the sitemap (§1.7) emits exactly that URL shape for every category. Any crawler following a sitemap category link hits the SPA's soft-404 (§1.9).

### 1.6 Robots.txt — exists, dynamic, well-designed
Not a static file — served dynamically by `apps/api/src/modules/sitemap/sitemap.routes.ts` at `GET /robots.txt`, gated by an admin-togglable `robotsEnabled` flag, correctly disallowing `/admin/`, `/account/`, `/checkout`, `/cart`, `/payment`, `/api/`, and linking the sitemap. No action needed beyond what §1.9 and §1.11 flag.

### 1.7 XML sitemap — exists, dynamic, Redis-cached, has a confirmed bug
`GET /sitemap.xml` builds a flat `<urlset>` from active products (cap 5000), categories (cap 1000), blogs (cap 2000), pages (cap 500), plus hardcoded static paths, cached in Redis for 1 hour. **Confirmed bug:** it emits `/categories/:slug` URLs that have no corresponding frontend route (§1.5) — every category URL in the sitemap currently leads to a soft-404. No sitemap index exists; if any collection exceeds its cap, excess documents are silently omitted (not an issue yet at demo-data scale, worth monitoring as the catalog grows).

### 1.8 Structured data — strong foundation, one dead function, two inconsistent inline duplicates
- `apps/api/src/modules/search/structured-data.util.ts` has schema.org-correct builders: `buildProductStructuredData()` (Product/Offer/AggregateRating, rating only emitted when real reviews exist — never fabricated), `buildFaqStructuredData()` (FAQPage, from admin-authored FAQs only), `buildCategoryStructuredData()` (CollectionPage).
- Product and FAQ builders are wired up and injected client-side via `useStructuredData()` on `ProductDetailPage.tsx` and `FaqPage.tsx`. **`buildCategoryStructuredData()` is fully built and unit-tested but never called from any route — confirmed dead code.**
- `BlogDetailPage.tsx` and `FaqPage.tsx` each hand-roll their own inline JSON-LD literal instead of reusing the shared builder for FAQ (duplicated logic, two sources of truth) — Blog uses `@type: "Article"` rather than the more specific `BlogPosting`.
- **Confirmed absent everywhere:** `Organization`, `LocalBusiness`, and `BreadcrumbList` structured data — and no business name/address/phone data model exists to populate `LocalBusiness` even if desired.
- Because injection happens in a `useEffect`, none of this JSON-LD exists in the raw HTML — only JS-executing crawlers see it.

### 1.9 404 handling — confirmed soft-404 (real SEO risk)
`infra/nginx/conf.d/spa.conf` does a standard `try_files $uri /index.html` SPA fallback — **any bad URL returns HTTP 200**, not 404. `NotFoundPage.tsx` renders a correct-looking error message but never calls `useDocumentMeta` (which has no `noindex` support to call anyway) — so there is no signal anywhere in the stack (status code, title, or meta tag) telling a crawler this is an error page. This directly compounds the sitemap/category mismatch (§1.5/§1.7): soft-404s are exactly what crawlers see when they follow those broken sitemap URLs.

### 1.10 Pagination — confirmed not URL-addressable
`ProductListPage.tsx`, `SearchResultsPage.tsx`, and `BlogListPage.tsx` all track `page` as plain React state, never synced to the URL (unlike `categoryId`/`brandId`/`q`, which are). `Pagination.tsx` renders plain buttons, not links — page 2+ of any list is unreachable by a crawler and unbookmarkable by a user. No `rel="next"/"prev"` exists (nor could it, with no distinct URLs to point at).

### 1.11 Redirects — confirmed absent
No `Redirect` model, admin UI, or middleware exists anywhere. If a product/category/blog slug changes, there is no way to 301 the old URL — it simply soft-404s. (Products do have `findByIdOrSlug` fallback for old ID-based bookmarks specifically, which is good practice, but doesn't cover slug renames.)

### 1.12 Breadcrumbs — component exists, not wired into the storefront
`components/layout/Breadcrumb.tsx` exists and is correctly ARIA-labeled, but its only consumer is `Topbar.tsx`, used exclusively by `AdminLayout.tsx` and `CustomerLayout.tsx` (logged-in account area) — **`PublicLayout.tsx` never renders it.** No breadcrumbs exist anywhere on PLP/PDP/blog today, and correspondingly no `BreadcrumbList` schema exists either.

### 1.13 Internal linking — mostly good, one crawler-invisible section
Related products (same-category, PDP) render real `<Link>`s — genuine crawlable internal linking. `RecentlyViewedProducts.tsx` also renders real links, but its data source is client-local browsing history — a stateless crawler visit always sees it render nothing, so it contributes zero crawl value (fine for users, just not an SEO asset).

### 1.14 Mobile-friendliness / Core Web Vitals (preliminary, code-level only — no live Lighthouse run performed)
- The default OG image (`/logo.jpg`, also the current header/footer logo) is **2.28MB** — a real weight concern anywhere it's actually fetched (social unfurls, and the live page itself per Prompt 1 analysis §16).
- No favicon beyond a 180×180 `apple-touch-icon.png` reused as the generic `rel="icon"` — minor, but not a proper multi-size favicon set.
- A true Core Web Vitals (LCP/INP/CLS) measurement requires a running, built instance — deferred to Prompt 3's Docker-based verification, not claimed here without data.

---

## 2. Technical SEO Gaps — Priority Summary

| # | Gap | Severity | Fix type |
|---|---|---|---|
| 1 | No `<h1>` on HomePage | High | Frontend |
| 2 | Sitemap emits `/categories/:slug`, no such route exists → soft-404s | High | Frontend (add route) or Backend (remove from sitemap) — see Roadmap |
| 3 | 404s return HTTP 200 (soft-404) with no noindex signal | High | Backend (nginx) + Frontend (meta robots) |
| 4 | CSR-only — crawlers that don't execute JS see an empty shell | High (structural, largest effort) | Frontend/Infra, large — scoped as an optional future phase, not required for Prompt 3 |
| 5 | Pagination not URL-addressable, no crawlable links to page 2+ | Medium | Frontend |
| 6 | PLP title/description/H1 static regardless of filter | Medium | Frontend |
| 7 | Admin-configured `siteTitle`/`siteDescription`/OG settings never consumed by storefront | Medium | Frontend (wire the existing config into `useDocumentMeta` defaults) |
| 8 | `buildCategoryStructuredData()` dead code | Low–Medium | Backend (wire it up once a category route exists) |
| 9 | No `Organization`/`BreadcrumbList` schema | Medium | Frontend + Backend (new builder) |
| 10 | Breadcrumb component not used on storefront | Medium | Frontend |
| 11 | No redirect-management system | Low (not urgent pre-launch) | Backend, future |
| 12 | Default OG image is 2.28MB | Medium | Asset/content (ties to Prompt 1's logo-optimization task) |
| 13 | `SearchResultsPage` and `NotFoundPage` never set meta/title | Low–Medium | Frontend |
| 14 | No `meta[robots]`/noindex support in `useDocumentMeta` | Medium | Frontend |
| 15 | Blog uses `Article` not `BlogPosting`; FAQ schema duplicated inline instead of reused | Low | Frontend/Backend cleanup |

---

## 3. Per-Page-Type SEO Recommendations

### Homepage
Add a real `<h1>` (the hero headline itself, per the Design System doc's hero spec — "spend boldness once" naturally gives us a strong, unique H1 rather than a hidden/visually-small one). Wire the existing (currently-dead) admin `siteTitle`/`siteDescription` config as the default title/description source for `useDocumentMeta`'s fallback, so the Super Admin's SEO Settings screen stops being inert. Target: brand name + core category terms (e.g. "BRENTIS HEALTHCARE — Order Medicines & Healthcare Products Online"), sourced from real positioning, not invented claims.

### Category pages
**Decision needed before this can be implemented (flagged for Prompt 3, not decided here):** either (a) build the missing `/categories/:slug` route+page so the existing sitemap entries and `Category.seo.*`/`buildCategoryStructuredData()` fields become real, reachable pages, or (b) stop emitting `/categories/:slug` in the sitemap and keep category browsing as `/products?categoryId=`. Option (a) is the stronger SEO outcome (clean, keyword-rich, crawlable category URLs) and reuses schema/backend work that already exists — recommended, but it's a routing change with real scope, so it's called out explicitly rather than assumed.

### Product pages
Already the strongest page type in the audit — dynamic H1, dynamic meta, Product/Offer/AggregateRating/FAQPage JSON-LD, admin-settable canonical, descriptive alt text. No structural fix needed; just ensure the content fields (name, brand, description, specifications, availability, real price) are populated from real product data as implemented in Prompt 3 — **never invent a product name, price, spec, or claim that isn't in the API response.**

### Blog
Switch inline `Article` JSON-LD to `BlogPosting` (more specific, still schema.org-valid) and reuse `buildFaqStructuredData`'s pattern (a shared builder) instead of the second hand-rolled inline FAQ object on `FaqPage.tsx`, for consistency and to avoid drift between the two copies. Content strategy: see §6 (AEO) and §9 (Healthcare Trust) — genuinely educational posts, not thin/duplicated content, and **every medical-adjacent claim must be reviewable against the demo/real product data and, where applicable, general consumer-health guidance** — never invented drug interactions, dosing advice, or efficacy claims.

---

## 4. GEO Strategy (Generative Engine Optimization)

GEO rides on the same foundations as good technical SEO plus clear entity/business signals — it is not a separate implementation track, and no ranking or citation outcome can be promised.

1. **Clearly structured company information:** add a real `Organization` JSON-LD block (name, logo, `sameAs` social profile URLs) site-wide, once real NAP data is confirmed (see §9 — current `ContactPage.tsx` email/phone/address are confirmed placeholders and must not be used as real Organization data until corrected).
2. **Accurate product information:** already strong (§3) — keep it that way; AI answer engines increasingly cite structured Product/Offer data directly.
3. **Consistent brand identity:** one canonical brand name/tagline/logo usage across the site (ties directly to the Prompt 3 rebrand work) — inconsistent naming (e.g. "KarienLabs" vs "BRENTIS HEALTHCARE" appearing interchangeably) actively hurts entity clarity for AI systems that resolve brand identity from scattered mentions.
4. **Trustworthy healthcare content:** see §9 — no fabricated claims, real authorship, real sourcing.
5. **Well-organized category information:** ties to §3's category-page decision — AI systems parse clean taxonomy pages more reliably than query-param-filtered lists.
6. **Authoritative educational resources:** genuine, non-thin blog content (§3/§6).
7. **Relevant citations/references:** where health-education content makes a factual claim, link to a real, reputable source (e.g. a government health body or established medical reference) rather than asserting unsourced facts — this is a content-authoring practice for Prompt 4+, not a code change.
8. **Clear entity relationships:** `Organization` → `Product` (`brand`, `manufacturer`) relationships are already partially modeled (`brandId`, `manufacturer` fields exist) — surfacing them consistently in structured data reinforces this.
9. **Crawlable and accessible content:** this is where the CSR limitation (§1.1/§2 item 4) most directly affects GEO — AI crawlers that don't execute JS will see an empty shell exactly like traditional search crawlers that don't execute JS. Flagged as the same structural gap, not a separate GEO-specific problem.
10. **Consistent business information:** once real NAP is established (§9), use it identically everywhere (footer, Contact page, Organization schema, any future `LocalBusiness` schema) — never let three different "About" blurbs or two different phone numbers coexist.

### `llms.txt` evaluation
`llms.txt` is a proposed (not yet standardized, not confirmed adopted by major AI crawlers) convention for pointing AI systems at a curated summary of a site. **Recommendation: useful as a low-cost, optional supplementary file — not a replacement for the sitemap, robots.txt, or structured data work above, all of which remain the primary, higher-confidence investment.** If added, it should be a short, factual summary (brand, what the site sells at a category level, link to sitemap) maintained by hand or generated from the same real data already powering the sitemap — never a place to state claims not substantiated elsewhere on the site. No ranking/citation benefit from `llms.txt` can be promised; it is speculative and should be treated as a cheap experiment, not a strategy pillar.

---

## 5. AEO Strategy (Answer Engine Optimization)

1. **FAQ sections where genuinely useful:** the Product and dedicated FAQ page already support `FAQPage` schema from admin-authored content only (never auto-generated) — this is sound and should be extended to Category pages once they exist (the `Category.faq[]` field already exists in the schema, confirmed unused today).
2. **Question-based headings:** use real customer questions as H2/H3s on educational blog content and category intros (e.g. "What is [category] used for?", "How do I choose between X and Y?") — only where a genuine, answerable question exists for that page; not formulaically on every page (consistent with the Design System doc's "earn every label" principle).
3. **Concise, direct answers:** lead each FAQ/blog answer with the direct answer in the first sentence, elaborate after — the pattern AI answer engines most reliably extract.
4. **FAQ schema only where eligible:** per current Google guidance, FAQ rich-result eligibility has narrowed significantly (largely restricted to well-established government/health sites in some verticals) — **implement the schema for AEO/LLM-extraction value regardless, but do not promise or imply FAQ rich-result SERP eligibility**, since that's a search-engine policy decision outside this project's control and has changed before.
5. **Product information structured for machine understanding:** already strong (§3) — maintain it.
6. **Clear breadcrumbs and navigation:** directly ties to §2 item 10 — breadcrumbs help both human wayfinding and machine understanding of site hierarchy.
7. **Delivery/return/contact questions:** these map directly to existing CMS-editable policy pages (`shipping-policy`, `return-policy`, `refund-policy`, `cancellation-policy`) — ensure these are genuinely filled in with real BRENTIS policy text (admin-authored, not fabricated) before launch, since AEO/trust both depend on this content actually existing and being accurate.

---

## 6. Healthcare Trust and Content Quality (YMYL)

Given the confirmed real catalog includes Schedule H prescription medicines (§0), this section carries more weight than it would for a cosmetics-only brand.

- **Transparent company information:** fix the three confirmed placeholder NAP fields on `ContactPage.tsx` (`support@medcommerce.example`, `+91 1800-000-000`, generic "Bengaluru, Karnataka, India" with no street address) before launch — placeholder contact information on a pharmacy site is both a trust and (per Google's YMYL guidance) a ranking-relevant signal. Real values must come from the user/business, never invented by this project.
- **Policy pages:** all six (Privacy, Terms, Return, Shipping, Cancellation, Refund) are CMS-driven (admin-editable at runtime, confirmed via `CmsPageView`) — ensure real, accurate, India-pharmacy-appropriate legal text is entered by the business/counsel, not placeholder/lorem content, before go-live.
- **Product information accuracy:** never invent dosage, indication, contraindication, or efficacy claims beyond what's in the real product record (`medicine.*` fields: genericName, composition, dosageForm, strength, storageInstructions, prescriptionRequired) — confirmed these fields already model the right data; the redesign must render them faithfully, not supplement them with generated copy.
- **Author attribution:** the blog schema already has a required `authorId` → `User` ref, rendered into `Article`/`BlogPosting` JSON-LD — good foundation. For YMYL health content, consider whether author bios should indicate relevant qualification (e.g. "reviewed by [role]") — this requires a real editorial policy decision from the business, not something to fabricate (never invent a "Dr." byline or medical credential that doesn't exist).
- **References to reliable medical sources:** per §4 item 7 — any factual health claim in blog/educational content should cite a real, checkable source.
- **Disclaimers:** the demo blog content already includes a template disclaimer ("...not a substitute for professional medical advice") — a real (non-demo) equivalent should be retained consistently on health-education content.
- **No unsupported medical claims, no fabricated doctors/certifications/endorsements:** this is an absolute constraint carried through every phase of this project, consistent with the user's explicit instruction and Google's YMYL guidance for medical e-commerce.

---

## 7. Backend and Database Impact Analysis

| Requirement | Frontend | Backend/API | DB migration | Admin | Infra |
|---|---|---|---|---|---|
| Add `<h1>` to Homepage | ✅ | – | – | – | – |
| Fix PLP dynamic title/H1/meta per filter | ✅ | – | – | – | – |
| Wire admin `siteTitle`/`siteDescription`/OG config into storefront defaults | ✅ (read existing config) | Possibly: expose `GET /public/seo/config` read-only endpoint if not already public (current `/admin/seo/config` is admin-only — confirm before assuming direct reuse) | – | – | – |
| Add `meta[robots]`/noindex support | ✅ (extend `useDocumentMeta`) | – | – | – | – |
| Breadcrumbs on storefront + `BreadcrumbList` schema | ✅ (wire existing `Breadcrumb.tsx` into `PublicLayout`, new schema builder) | New `buildBreadcrumbStructuredData()` util (mirrors existing pattern) | – | – | – |
| `Organization` schema | ✅ (new injection) | New `buildOrganizationStructuredData()` util, sourced from real NAP once available | Possibly: a real `BusinessIdentity`/NAP field set doesn't exist yet — needs a minimal schema addition if NAP is to be DB-managed rather than hardcoded | New minimal settings fields if DB-managed | – |
| Category pages (`/categories/:slug`) — if the decision in §3 is made to build them | ✅ (new route/page) | None needed — `Category.seo.*`, `buildCategoryStructuredData()` already exist and just need wiring | – | – | – |
| Fix sitemap/category mismatch | – | ✅ (wire `buildCategoryStructuredData` + decide sitemap emission based on §3's decision) | – | – | – |
| Fix soft-404 HTTP status | – | – | – | – | ✅ nginx config: a targeted rule to return true 404 status for unmatched asset-like paths is possible, but a full "true 404 for any bad SPA route" fix is inherently limited by SPA architecture — document this honestly as a partial mitigation (title/meta `noindex` on `NotFoundPage`) rather than a complete 200→404 fix |
| URL-addressable pagination | ✅ (sync `page` to `useSearchParams`, same pattern already used for `categoryId`) | – | – | – | – |
| Real NAP (contact email/phone/address) | ✅ (render) | – | – | ✅ business must supply real values; if admin-editable, minor model addition | – |
| Optimize default OG image | – | – | – | – | Asset replacement, ties to Prompt 1's logo task |

**No destructive or unnecessary database migrations are required anywhere in this plan.** Every structural SEO fix reuses fields/schemas that already exist (`seo.metaTitle/metaDescription/canonicalUrl` on Product/Category, `faq[]`, `authorId`, etc.); the only potential new fields are a small NAP/business-identity settings addition (if the business wants it DB-managed rather than hardcoded in `Footer.tsx`'s existing pattern) and nothing beyond that.

**Admin UI impact:** zero required changes to existing admin screens for the gaps above — all the necessary admin-editable fields (`SeoSettingsPage.tsx`, `SiteSettingsPage.tsx`, per-product/category SEO fields in their respective admin forms) already exist; the fixes are entirely about the **storefront actually reading and rendering** what admins already can configure. If NAP becomes DB-managed, a small addition to an existing settings screen (not a new admin section) would be the minimum viable change — flagged for explicit user approval before touching any admin screen, per the admin-protection rule.

---

## 8. Keyword and Content Architecture (India market, evidence-based)

Built from the real catalog taxonomy (§0) — **not invented**. Categories confirmed via `apps/api/src/scripts/migrate-demo-content.ts` (explicitly labeled demo content, but the only structured catalog evidence in the repo, and a realistic shape for an India OTC+Rx pharmacy):

Pain Relief & Fever · Vitamins & Supplements · Diabetes Care · Digestive Health · Allergy & Cold · Personal Care · Wellness & Heart Health · Baby & Mother Care.

| Type | Examples (derived from real taxonomy, India market) |
|---|---|
| Brand keywords | "BRENTIS HEALTHCARE", "BRENTIS pharmacy online", "BRENTIS Mind That Cares" |
| Category keywords | "buy vitamins online India", "diabetes care products online", "digestive health supplements India", "allergy medicine online India" |
| Product keywords | Exact product names once real catalog is confirmed (e.g. demo-shape examples: "paracetamol 500mg online", "daily multivitamin capsules") — **must be replaced with real SKUs before use, never shipped as literal demo names** |
| Informational / question-based | "what is the difference between paracetamol and ibuprofen", "how to choose a multivitamin", "is [category] safe for daily use", "schedule H medicine meaning India" |
| Transactional | "order medicine online India", "online pharmacy same day delivery", "[category] combo offer" |
| Long-tail | "[product] price in India", "[category] for [audience, e.g. elderly/baby]", "genuine [brand] medicine online" |

**Site architecture (recommended, ties to §3's open category-page decision):**
```
Home
 ├─ Category hub pages (if §3 option (a) is chosen) → Product listing (filtered) → Product detail
 ├─ Search
 ├─ Blog (educational) → Blog post (cross-links to relevant category/product)
 ├─ Offers
 ├─ About / Contact / Policies (trust layer)
 └─ Brands / Manufacturers (currently plain lists, no detail pages — flagged as a future enhancement, not required now)
```
Internal linking should flow: Home → Category → Product (already works) and Blog post → relevant Category/Product (not yet implemented — a real content/engineering task for Prompt 4+, not assumed done).

---

## 9. Performance & Accessibility Requirements (SEO-relevant subset)

- **LCP:** hero image/text must not be render-blocked by font loading — use `font-display: swap` (per Design System doc §2) and avoid a large unoptimized hero image (learn from the 2.28MB logo mistake, §1.14).
- **INP:** keep interaction handlers (filter changes, add-to-cart) light; avoid synchronous heavy work on click.
- **CLS:** explicit image dimensions everywhere (already good practice per Prompt 1's alt-text audit finding real `alt` usage; extend the same discipline to width/height).
- **Image optimization:** replace the 2.28MB default OG/logo image; serve responsive product images (ties to Prompt 1 analysis §16's Cloudinary-transform recommendation).
- **Semantic HTML:** real `<h1>`–`<h6>` hierarchy (fixing §1.3's gap), `<nav>`/`<main>`/`<article>` landmarks, which doubles as both an accessibility and SEO foundation.
- **These are Prompt 3 frontend-foundation tasks** per the user's own Prompt 3 instructions (§11 "SEO/GEO/AEO preparation") — not deferred to Prompt 4.

---

*Companion documents: [`BRENTIS_UI_REDESIGN_ANALYSIS.md`](./BRENTIS_UI_REDESIGN_ANALYSIS.md), [`BRENTIS_DESIGN_SYSTEM.md`](./BRENTIS_DESIGN_SYSTEM.md), [`BRENTIS_IMPLEMENTATION_ROADMAP.md`](./BRENTIS_IMPLEMENTATION_ROADMAP.md), [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md).*
