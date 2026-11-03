# BRENTIS Dynamic CMS Audit — Prompt 3

Scope: eliminate hardcoded business content and hardcoded external image URLs from the customer-facing website, making every applicable section admin-manageable through the existing admin panel, backed by MongoDB + Cloudinary.

**Key finding from inspection**: a substantial CMS backend already existed and was fully built (Banner/HomeSection/Blog/Page/Faq models, admin CRUD, public read-only endpoints, admin UI screens) — it simply wasn't being *consumed* by the storefront homepage, which read from hardcoded constants instead. Most of this prompt's work is wiring the frontend to real data that was already there, plus closing the two genuine gaps: category images (no admin-manageable field existed) and the homepage "About Us" teaser (no structured content entity existed). The 6 policy pages and the full About Us page were *also* silently broken (0 `Page` documents existed in the database, so `/about` and all 6 policy routes rendered "Page not available") — this is now fixed with real extracted content.

## 1. Dynamic sections implemented

| Section | Before | After |
|---|---|---|
| Homepage hero | Hardcoded `HERO_SLIDES` array in `HomePage.tsx` | Fetches `GET /public/cms/banners?placement=hero`; admin-managed via `/admin/cms/banners` |
| Homepage "Shop by Category" images | Hardcoded `CATEGORY_PHOTOS` object keyed by slug, with an Unsplash fallback | `Category.imageUrl`/`imageAlt`/`imagePublicId` (new fields), admin-uploaded via Cloudinary in the Categories admin form |
| Homepage "About Us" teaser (heading/description/image/4 value blocks) | Hardcoded `ABOUT_BLOCKS` array + hardcoded image URL | `Configuration` 'about' namespace, admin-managed via new `/admin/cms/about` page |
| Homepage "Why BRENTIS" highlights | Hardcoded `WHY_BRENTIS` array + hardcoded image URL | Same 'about' namespace document (`highlights`/`highlightsImageUrl` fields), same admin page |
| Homepage "Selected Products" | Hardcoded `sort:-createdAt, limit:4` query only | Prefers an admin-curated `HomeSection` (`type:'product_grid'`) via `GET /public/cms/home-sections`; falls back to the same latest-4 query only when no section is configured — product price/stock/name always come live from the real `Product` collection, never duplicated |
| Blog section | Already dynamic (`listPublicBlogs`) | Unchanged — already correct |
| About Us full page (`/about`) | `Page` model existed but 0 documents were seeded → page rendered "Page not available" | Seeded from `aboutus.txt` (Vision/Mission/Commitments/Contact, verbatim), admin-editable via `/admin/cms/pages` |
| 6 policy pages (`/privacy-policy`, `/terms`, `/return-policy`, `/shipping-policy`, `/cancellation-policy`, `/refund-policy`) | Same — 0 `Page` documents, all rendering "Page not available" | Seeded from `WEBSITE DOCUMENTATION.docx`, verbatim legal text, structurally converted to HTML, admin-editable via `/admin/cms/pages` |
| Footer (company description, quick links, social links) | Already dynamic (`getPublicSiteSettings`) with a documented hardcoded fallback for when the namespace is empty | Unchanged — already correct; fallback behavior is intentional and documented (see §6) |

## 2. Database models

- **`Category`** (`apps/api/src/modules/catalog/models/category.model.ts`) — added `imagePublicId: String|null` and `imageAlt: String`. Existing `imageUrl` field reused.
- **`Configuration`** (existing generic namespaced settings store) — added a new `'about'` namespace (registered in `packages/shared/src/constants/notifications.ts`'s `CONFIGURATION_NAMESPACES`, enforced by the Mongoose schema's `enum`) and a dedicated zod schema (`apps/api/src/modules/cms/about-content.validator.ts`) registered in `configuration.service.ts`'s per-namespace validation map. Chosen over a new dedicated Mongoose collection because it is a true **singleton** document (not a repeating/orderable list — the thing every "avoid one giant blob" guidance is really warning about), and the project already has an established, working convention for exactly this shape of content (`SiteSettingsPage.tsx` → `'cms'` namespace → public `/site-settings` endpoint). A typed zod schema prevents it from being the unstructured blob the prompt warns against.
- **`Banner`, `HomeSection`, `Blog`, `Page`, `Faq`** — pre-existing, unchanged, now actually consumed by the storefront.

## 3. APIs

**New:**
- `GET/PUT /api/v1/cms/about` (admin, `requireAuth` + `authorize(CMS, READ/UPDATE)`) — `apps/api/src/modules/cms/about-content.routes.ts`
- `GET /api/v1/public/cms/about` (anonymous) — `public-cms.routes.ts`

**Extended:**
- `PATCH /api/v1/categories/:id` now accepts `imageUrl`/`imagePublicId`/`imageAlt`; safe Cloudinary replace/delete wired into `category.service.ts` via a new `category-image.service.ts` (mirrors the existing `banner-image.service.ts` orphan-check pattern exactly).

**Unchanged, newly consumed by the frontend:**
- `GET /api/v1/public/cms/banners?placement=hero`
- `GET /api/v1/public/cms/home-sections`

## 4. Admin screens

- **New**: `/admin/cms/about` (`AboutContentPage.tsx`) — bespoke form (same pattern as the existing `SiteSettingsPage.tsx`), with Cloudinary image upload for the main image and the highlights image, and a repeatable block editor (icon dropdown + title + description) for both the 4 value blocks and the highlights list.
- **Extended**: Categories admin form (`CategoriesPage.tsx`) gained a `CategoryImageFields.tsx` component (same pattern as `BannerImageFields.tsx`) — image upload, alt text, and an explicit "No image set" warning shown to the admin when a category has none (the "image-missing status in admin" requirement; surfaced in the edit drawer, not yet as a dedicated list-column — see §7).
- All other CMS screens (Banners, Home Sections, Blogs, FAQs, Pages, Site Settings) already existed and required no changes.
- Admin sidebar/layout/theme: zero changes beyond one new `CMS_MENU` entry ("About Us") and one new lazy-loaded route. No existing admin page's CSS, business logic, or permissions were touched.

## 5. Cloudinary integration

Already centralized (`apps/api/src/integrations/cloudinary/`) — reused as-is, not rebuilt:
- Direct-to-Cloudinary signed upload flow (`createUploadSignature` → browser uploads directly → `POST /files` registers the asset)
- `destroyAsset(publicId)` for deletion
- The existing `'cms_media'` upload preset reused for category and about-content images (folders `categories/`, `about/`)
- Credentials resolved from env vars / `Configuration` 'cloudinary' namespace — never hardcoded, never sent to the frontend

**Safe replace/delete, newly wired for Category and About:**
- Category: `category-image.service.ts`'s `destroyIfOrphaned()` — checks no other live category still references the same `publicId` before calling `destroyAsset`; called from `category.service.ts`'s `updateCategory`/`deleteCategory`.
- About: `about-content.service.ts`'s `destroyIfReplaced()` — simpler check since it's a true singleton (no "shared asset" case possible); destroys the old `mainImagePublicId`/`highlightsImagePublicId` only after the new Configuration write has committed, and only if the public_id actually changed.
- Both follow the existing `Banner` precedent exactly: never delete before the new upload + DB write succeed; log-and-swallow Cloudinary errors (a Cloudinary failure never fails the request that already saved correctly); `publicId` used for deletion, never a guessed URL.

## 6. Content migration

`apps/api/src/scripts/migrate-demo-content.ts` extended (idempotent — every block checks for an existing record/value before writing, never overwrites admin-edited data):
- **Category images**: backfills `imageUrl`/`imageAlt` from the same photography that used to be hardcoded in `CATEGORY_PHOTOS`, only when `imageUrl` is currently empty.
- **About content**: seeds the 'about' Configuration namespace from the same copy that used to be in `ABOUT_BLOCKS`/`WHY_BRENTIS`, plus the real Vision statement from `aboutus.txt`, only if nothing has been saved there yet.
- **Pages**: seeds `about-us` + the 6 policy slugs from `apps/api/src/scripts/content/policy-pages.generated.ts` (new file — real, verbatim content extracted from `WEBSITE DOCUMENTATION.docx` via `python-docx`, structurally converted to HTML; see that file's own header comment), only if a `Page` with that slug doesn't already exist.
- **Hero/category banner images were also fixed** (see §8 below — a real bug found during this work, not originally in scope, but directly caused by wiring the homepage to real data).

Ran against the local dev database: `categories: 8 reused / category_images: 8 created`, `pages: 7 created`, `about_content: 1 created`, `banners: 5 reused` (images separately patched — see §8). Idempotency verified by the script's own match-before-write logic (confirmed safe to re-run).

## 7. Hardcoded content removed

Final grep audit, run from the repo root against `apps/web/src`:

```
CATEGORY_PHOTOS            → 0 matches (object fully removed; 1 comment reference in CategoryImageFields.tsx explaining what it replaced)
images.unsplash.com        → 0 matches in any .tsx/.ts component
dqdbmfdlt (broken Cloudinary placeholder account) → 0 matches anywhere
HERO_SLIDES / *_SLIDES      → 0 matches
ABOUT_BLOCKS / WHY_BRENTIS  → 0 matches
```

### Classified remaining items (why each is application UI, not business content)

| Item | File | Classification |
|---|---|---|
| `QUICK_LINKS`, `SOCIAL_LINKS`, default company description | `Footer.tsx` | **Intentional fallback, not a hidden default.** Already wired to `getPublicSiteSettings()` first; the hardcoded values only render if the Configuration namespace is empty or the fetch fails, so the footer never breaks mid-render. Pre-dates this prompt; left as-is since it satisfies "use safe defaults only for application UI" in spirit — the *real* footer path is the dynamic one. |
| `POLICY_NAVIGATION` (labels/paths/icons for the policy sidebar) | `CmsPageView.tsx` | Navigation structure (which routes exist, in what order, with what icon) — not editable business content. The actual policy *text* for every one of these entries now comes from the `Page` API. |
| "Stay Updated" / newsletter copy | `HomePage.tsx`, `Footer.tsx` | Generic application UI copy (a form label), not a business claim — no Vision/Mission/legal/contact content here. |
| Customer Trust fallback paragraph (shown only when zero reviews exist) | `HomePage.tsx` | Judgment call, left as static text: it's truthful, non-fabricated, and only renders in the specific zero-reviews case. Could be moved into the 'about' namespace in a future pass; flagged here rather than silently left out. |
| Icon SVG paths (`ABOUT_ICONS` lookup, `WhyBrentisIcon*`, etc.) | `HomePage.tsx` | Pure presentation — the admin picks from a closed `iconKey` enum; the SVG markup itself is never admin-authored (deliberately, to prevent HTML/SVG injection — see §9). |

## 8. Bug found and fixed during this work (not originally in scope)

Wiring the homepage hero to the **real** seeded `Banner` documents (instead of 3 hand-picked clean photos) surfaced a live bug: all 5 seeded Banner images were Cloudinary assets from the `dqdbmfdlt` account with the headline/CTA **baked into the image pixels** — the same defect class previously found and fixed for product and blog cover images. With real data, this collided with `HeroCarousel`'s own live text overlay, producing visibly duplicated text. Root-caused by direct image inspection (not assumed), then fixed at the data level: all 5 banner `imageUrl` values (2 hero, 3 category-placement) replaced with real, individually verified, text-free stock photography, applied both in the migration script (for future fresh seeds) and directly against the live dev database (for the already-seeded records, since the migration's match-and-skip logic never touches existing rows). Confirmed visually fixed via a live screenshot after the patch.

## 9. Security checks

- All CMS mutation routes (`/cms/about`, `PATCH /categories/:id`) require `requireAuth` + `authorize(permission(RESOURCES.CMS|CATEGORIES, ACTION))` — identical middleware chain to every other admin route in this codebase.
- Public endpoints (`/public/cms/about`, `/public/cms/banners`, etc.) are read-only, anonymous, and scoped to published/active content only (`isActive`/`isPublished` filters already enforced by the pre-existing public router; the new `/public/cms/about` endpoint has no draft/published concept since it's a singleton always-live document — same as `/public/cms/site-settings`).
- Server-side validation: `aboutContentSchema` (zod) validates every field on write, including a **closed enum** for `iconKey` so an admin can never inject arbitrary SVG/HTML through the icon picker; `category.validator.ts` extended with `imagePublicId`/`imageAlt` validation.
- Rich text (`Page.content`) was already sanitized client-side via `sanitizeHtml()` before `dangerouslySetInnerHTML` in `CmsPageView.tsx` — unchanged, reused as-is for the newly-seeded policy/about-us pages.
- No Cloudinary secrets reach the frontend bundle (confirmed: upload flow is signed-URL based, frontend never sees API secret).
- No public route allows asset deletion; `destroyAsset` is only ever called from authenticated admin-mutation code paths.

## 10. Test results

| Suite | Result |
|---|---|
| `npm run typecheck` (api + web) | Clean, 0 errors |
| `npm run lint` (web) | 0 errors (9 pre-existing/minor import-order warnings, unchanged category) |
| `npm run test` (api unit) | **279/279 pass** |
| `npm run test:integration` (api, run on host against ephemeral `mongodb-memory-server` + local `redis-server` — never touches Atlas) | **220/220 pass** |
| `npm run build` (web production build) | Succeeds, no errors |
| Live browser verification | Homepage hero/about/category-row/selected-products/why-brentis all confirmed rendering real CMS data at 1280–1440px; category single-row carousel scroll-right confirmed via `scrollLeft` state change + visual re-screenshot; `/about` confirmed rendering real seeded content (previously broken); admin `/admin/cms/about` confirmed loading and editable; admin Category edit drawer confirmed showing the new image field with upload/replace/alt-text controls, admin sidebar/layout visually unchanged |
| Guest cart / checkout / Razorpay / admin auth | Not touched this prompt; covered by the unit/integration suite above (220/220 includes the guest-cart and webhook-security suites) |

**Not independently live-tested this session** (disclosed honestly, not claimed): full admin CRUD round-trip (create/edit/delete/reorder) for Banners/HomeSections/Blogs/Pages was not re-exercised live (those screens are pre-existing and unmodified by this prompt — only the About/Category screens are new/changed and were live-verified); Cloudinary upload/replace/delete was verified by reading the code path and the pre-existing `Banner` precedent it mirrors, not by performing a live image upload through the browser in this session.

## 11a. Prompt 4 — end-to-end verification (actually performed, not assumed)

Per Prompt 4 §11's explicit instruction not to assume Prompt 3 worked just because admin screens exist, a real end-to-end CMS cycle was performed this session against the **Category image** flow (the newest, least-previously-tested piece), using the live admin API with a real logged-in super-admin session (not a mock):

1. Requested a real signed upload from `POST /api/v1/uploads/signature` — succeeded, real `signature`/`timestamp`/`cloudName` returned.
2. Uploaded a real generated JPEG directly to Cloudinary's upload API with that signature — succeeded, real `public_id`/`secure_url`/`width`/`height` returned (`categories/zlioea8dyu3iibvgy0st`, 400×500).
3. `PATCH`ed the "Baby & Mother Care" category with the new `imageUrl`/`imagePublicId` — DB write confirmed via the response body and a follow-up `GET /api/v1/categories`.
4. Confirmed the new image appeared on the **customer homepage** immediately (no manual refresh needed — `img.src` on the live DOM matched the new Cloudinary URL exactly).
5. Uploaded a **second** image and `PATCH`ed again (replace) to test safe deletion of the now-orphaned first image.

**Finding: the replace step revealed a real, previously undetected bug.** The orphan-check logic itself fired correctly — `apps/api/logs/api-third-party-api-*.log` shows a `cloudinary destroy` call was made with the right timing (only after the DB write committed) — but the call **failed** (`"errorMessage":"Asset destroy failed"`), and the same log file shows the `upload_preset:get` Admin-API call (made on every signature request, via `ensureUploadPreset()`) **also failing** (`"errorMessage":"Admin API error"`). Both failures are Cloudinary **Admin API** calls specifically — the **Upload API** (used for the actual file upload and for signature generation) works correctly, confirmed by the two successful uploads above using the same credentials. This points to an account/credential-level restriction on Admin API access for this Cloudinary account (not reproducible from application code alone — would need Cloudinary dashboard access to diagnose the exact cause: API-key scope, IP allowlist, or plan restriction).

**Practical impact**: old Cloudinary images are currently **not actually being deleted** when replaced — they become unreferenced (correctly removed from the DB/frontend) but remain in Cloudinary storage. This was true for Banner image replacement in Prompt 3 as well (same `destroyAsset` function, same account) — that work was verified by code-review/pattern-matching against the Banner precedent, not by an actual live delete-and-confirm cycle, so this bug was present but undetected until this session's explicit end-to-end test. The *application-level* safe-replace contract (never delete before the new write succeeds, never delete a shared asset, log-and-swallow failures rather than breaking the request) is working exactly as designed — the failure is one level below, in the actual Cloudinary Admin API call succeeding or not. No customer-facing or data-integrity impact (images never go missing; the only consequence is accumulating unused storage on the Cloudinary account).

Test category was restored to its original image afterward; no permanent change to `Baby & Mother Care`'s data beyond this verification.

## 11b. Prompt 4 — Best Sellers category tabs (new CMS feature)

Extends the existing `HomeSection` model (no new collection) with a `'category_tabs'` type:
- `categoryIds[]` (ordered) defines the tab list; first entry is the default-active tab.
- Products are **never** stored on the HomeSection — each tab's products are resolved live, server-side, from the real `Product` collection filtered by `categoryId` (`isActive: true`, limit 8, newest-first), at `GET /public/cms/home-sections` response time, reusing the same `resolveProductAvailability` stock-resolution path every other storefront surface uses.
- Admin UI: `/admin/cms/home-sections` → new "Category Tabs (Best Sellers)" type option + a new `HomeSectionCategoryFields.tsx` ordered category picker (add/remove/reorder by list position), reusing the real category tree, never a free-text field.
- Seeded via the migration script with 4 real, existing BRENTIS categories (Pain Relief & Fever, Vitamins & Supplements, Personal Care, Wellness & Heart Health) — never invented categories like the reference's "Sun Care"/"Hair Care" (this catalog doesn't sell skincare).
- **Live-verified**: clicked between tabs on the running homepage; confirmed via `read_page`'s interactive tree that the rendered product links actually changed (`ibuprofen-400mg-tablets`/`paracetamol-500mg-tablets` under the default tab → `vitamin-c-1000mg-tablets`/`daily-multivitamin-capsules` after clicking "Vitamins & Supplements") — a real state change driven by real data, not a static mock.

## 11. Remaining exceptions / known gaps

- **Cloudinary asset deletion currently fails at the Admin-API level** (see §11a) — a real bug found this session via actual end-to-end testing, not yet fixable from application code alone (needs Cloudinary account/dashboard investigation). Orphaned images accumulate in Cloudinary storage instead of being removed; no customer-facing or data-integrity impact.
- **Customer Trust fallback copy** (§7) — left as static text, a defensible judgment call, not moved to CMS this round.
- **Cashback/Wallet/Coupon Policy** and **B1G1 Offer Terms** — both real policies exist in `WEBSITE DOCUMENTATION.docx` but have no corresponding live storefront route; not added (would be new scope beyond the 6 existing policy pages named in this prompt). Flagged for a future business decision, not silently dropped — the content was extracted during the same pass and could be wired in with one more `Page` + route pair if wanted.
- **Admin "image missing" indicator** — implemented as a warning inside the category edit drawer, not as a dedicated column in the Categories list table (would require a deeper change to the generic `ConfigEntityPage` table factory than this prompt's scope justified).
- **Policy HTML formatting** — the WEBSITE DOCUMENTATION.docx → HTML conversion is heuristic (paragraph/heading/list detection based on text shape, since the source `.docx` uses no real Word heading styles). Every word of the real legal text is preserved verbatim; only visual grouping (which short lines became a `<ul>` vs. stayed separate `<p>` tags) is imperfect in a few places. Spot-checked, not line-by-line verified against the source for all ~85,000 characters of extracted content.
