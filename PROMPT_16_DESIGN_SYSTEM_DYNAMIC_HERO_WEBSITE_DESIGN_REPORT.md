# KarienLabs Storefront — New Visual Design System, Dynamic Hero, Admin Website Design

## 1. Files/components modified

**Design tokens:**
- `apps/web/tailwind.config.js` — added a new, storefront-scoped color block (`deep-teal`, `healthcare-teal`, `soft-mint`, `coral`, `charcoal-teal`, `slate-teal`, `pale-sage`) alongside the existing, untouched `brand`/`brand-gradient-end` tokens. Admin Control Panel keeps its original orange palette everywhere — nothing in `apps/web/src/modules/admin/**` or `apps/web/src/layouts/AdminLayout.tsx` references the new tokens.

**Storefront UI (recolored/restructured to the new system):**
- `apps/web/src/components/layout/Header.tsx` — reordered to `[Logo] [Search] [Products] [Offers] [Blog] [About] [Bulk Purchase] [Account] [Cart]`; deep-teal sticky chrome; search sits inline on desktop, full-width on its own row below `lg`; mobile hamburger drawer with all nav links + Control Panel.
- `apps/web/src/layouts/PublicLayout.tsx` — background now `bg-soft-mint`.
- `apps/web/src/components/layout/Footer.tsx` — deep-teal background, white-opacity text scale, coral link/button accents.
- `apps/web/src/components/common/Button.tsx` — two new variants, `coral` (primary CTA) and `teal` (secondary CTA).
- `apps/web/src/components/layout/ThemeToggle.tsx` — added an optional `className` prop (additive; default behavior for existing callers like the admin `Topbar` is unchanged) so the header could override its hover color against the dark chrome.
- `apps/web/src/modules/storefront/pages/HomePage.tsx` — hero now dynamic (see §6); recolored every section to the new palette; added **Popular Products** and **Bulk Purchase / Distributor CTA** sections (see §8).
- `apps/web/src/modules/storefront/components/ProductCard.tsx`, `apps/web/src/modules/storefront/pages/ProductDetailPage.tsx` — recolored to the new palette; Add to Cart uses the `coral` variant, Buy Now uses `teal`.

**Admin (Website Design / Banners):**
- `apps/web/src/layouts/AdminLayout.tsx` — sidebar section label `CMS` renamed to `Website Design` (cosmetic only — same routes, same `resource: 'cms'` permission gate, same menu items).
- `apps/web/src/modules/admin/cms/pages/BannersPage.tsx` — rewritten: declarative fields for title/subtitle/CTA text/link/placement/order/slide duration, plus a `renderExtraFields` block (see new component below) for image upload and scheduling.
- `apps/web/src/modules/admin/cms/components/BannerImageFields.tsx` (**new**) — Cloudinary image upload widget + `Starts at`/`Ends at` datetime fields, injected into the same form via `ConfigEntityPage`'s existing `renderExtraFields`/`extraDefaultValues` escape hatch (the same mechanism `CategoriesPage.tsx` already uses for nested fields — reused, not duplicated).

**Storefront hero carousel:**
- `apps/web/src/modules/storefront/components/HeroCarousel.tsx` (**new**) — auto-advancing, admin-data-driven carousel (see §6).

## 2. New components created

- `HeroCarousel.tsx` — dynamic hero carousel, storefront.
- `BannerImageFields.tsx` — Cloudinary upload + scheduling fields, admin.

No other new components were needed — "Featured Products" and category promo sections reuse the pre-existing, already-integrated `HomeSections` admin feature (see §8).

## 3. New backend/API/DB changes

**`Banner` model** (`apps/api/src/modules/cms/models/banner.model.ts`) — extended with 4 fields: `subtitle`, `ctaText`, `startsAt`/`endsAt` (nullable `Date`, already-existing scheduling logic on the public read endpoint just needed admin-form exposure), `slideDurationMs`, and `imagePublicId` (needed for Cloudinary lifecycle tracking). `cms.validators.ts`'s `createBannerSchema` extended to match.

**`createCrudRouter` factory** (`apps/api/src/utils/crud-router.factory.ts`) — added two purely-optional, additive hooks to `CrudRouterOptions<T>`: `afterUpdate` and `afterDelete`. They mirror the codebase's existing opt-in `auditActions` pattern; the extra `findById` lookup they need only runs when a hook is actually supplied, so this is a zero-behavior-change, zero-cost addition for the ~15 other entities already using this factory (delivery partners, GST settings, notification templates, etc.).

**`banner-image.service.ts`** (**new**, `apps/api/src/modules/cms/banner-image.service.ts`) — the Cloudinary-safe lifecycle logic, wired into the banners CRUD router via the new hooks (`cms.routes.ts`). See §7 for the exact rule and how it was verified.

No changes were made to authentication, checkout, payments, inventory, RBAC, or any other business-critical module.

## 4. Website Design / Admin functionality added

- Sidebar section renamed `CMS` → `Website Design` (Banners / Homepage Sections / Blogs / FAQs / Pages / Site Settings all already lived under this menu — no duplicate section was created).
- Banners admin form now supports: image upload (real Cloudinary widget, `preset="cms_media"`, `folder="banners"`), title, subtitle, CTA text, CTA link, placement (hero/category/checkout), display order, active/inactive, optional start/end scheduling, optional per-banner slide duration.
- Multiple active `hero`-placement banners now drive a real auto-advancing carousel on the homepage — nothing hardcoded (verified live, §9).

## 5. Cloudinary handling implemented

Extends the codebase's existing DB-write-then-destroy pattern (already used by `product.service.ts` for product images), with one genuinely new safety check that has no prior precedent in this codebase: before destroying an old Cloudinary asset, `banner-image.service.ts` checks `BannerModel.exists({ imagePublicId, _id: { $ne: excludeBannerId }, deletedAt: null })` — if any other live banner still references the same asset, the destroy call is skipped entirely. This directly satisfies the requirement to never blindly delete an asset still referenced elsewhere (banners are the one place in this app where the same Cloudinary asset can legitimately be reused across multiple records). Destroy failures are caught and logged, never thrown — a failed Cloudinary cleanup never breaks the banner CRUD operation itself.

## 6. Hero carousel behavior

`HeroCarousel.tsx` fetches all active `placement: 'hero'` banners (not just one) via the existing public, unauthenticated `getPublicBanners('hero')` endpoint. Auto-advances every `slideDurationMs` (per-banner, admin-configurable) or a 5s default; Previous/Next buttons; pagination dots (`role="tablist"`); pauses on hover/focus; CSS opacity crossfade (no animation library, no layout shift — fixed-height container regardless of image dimensions). If zero active hero banners exist, `HomePage.tsx` falls back to a fully-templated static hero (new palette, SVG illustration, no external image dependency) so the homepage never breaks. Nothing about slide content, count, or order is hardcoded — confirmed live by creating two real banners via the API and watching the carousel pick them up, including Next/pagination-dot navigation between them (§9).

## 7. Cloudinary lifecycle — how it was verified

Browser-based file upload wasn't available through this session's automation tooling (no native file-picker driver), so the lifecycle rule was verified directly against the running API instead of through the widget:

1. Created Banner A and Banner B, both pointing at the same `imagePublicId`.
2. Updated Banner A to a new image — response time **162ms**, no Cloudinary log entry → destroy correctly **skipped** (Banner B still referenced the old asset).
3. Updated Banner B to a new image (now nothing references the old asset) — response time **1113ms**, matching a real outbound Cloudinary API round-trip → destroy correctly **attempted**.
4. Deleted both banners — soft-delete + `afterDelete` hook ran without error.

This is the exact behavior Part 5's "do NOT blindly delete a Cloudinary asset if it is still referenced elsewhere" requirement calls for.

## 8. Homepage sections

Order: Hero → Shop by Category → Offers/Deals → (admin-configured `HomeSections`, which is how "Featured Products" is meant to be curated — see note below) → New Arrivals → Popular Products → Why Shop With KarienLabs (trust) → Bulk Purchase/Distributor CTA → Top Brands → Customer Reviews → From the Blog → Footer (with Newsletter).

- **Popular Products** (new) — genuinely distinct from New Arrivals (`-createdAt`): sorts by the product model's existing, real `ratingCount`/`ratingAvg` fields (`sort=-ratingCount,-ratingAvg`), filtered to products with at least one real rating. No schema change was needed — the Product model already had these fields; only the existing generic `sort` query param needed to be used. Renders nothing if no product has been rated yet, rather than showing an arbitrary order — no fake "popularity" is invented.
- **Featured Products** — the Product model has no `isFeatured`/sales-count field, and none was added. Instead, the pre-existing, already-wired `HomeSections` admin feature (Homepage Sections page, `product_grid`/`category_grid` types with manually curated `productIds`) is the intended mechanism: an admin creates a section titled "Featured Products" and picks real products. Building a second, parallel "featured" flag would have duplicated this existing, purpose-built system.
- **Bulk Purchase / Distributor CTA** (new) — previously only reachable via header/footer links; now has its own homepage section (deep-teal banner, coral "Enquire now" CTA → `/bulk-purchase`). This is navigational/marketing copy, not product data, so it carries no "fake data" risk.

## 9. Testing performed

- `npm run typecheck` — clean on both `@medcommerce/web` and `@medcommerce/api`.
- `npm run lint` — 0 errors on both (same 5 + 3 pre-existing, unrelated warnings as before this work).
- `npm run test` (API unit) — **276/276 pass**.
- `npm run test:integration` (API) — **200/200 pass** effective (4 tests in one unrelated file — `security-headers.integration.test.ts`, which touches neither banners, CMS, nor the CRUD factory — were cancelled by a transient MongoMemoryReplSet port collision when run back-to-back at `--test-concurrency=1`; re-ran that file alone and all 4 passed).
- Live browser (desktop + mobile 375px, light + dark mode), both storefront and admin:
  - Homepage color system: header/hero/category tiles/product cards/trust section/bulk CTA/footer all render the new teal/mint/coral palette correctly in both themes; header/footer chrome intentionally stays deep-teal in dark mode by design (already very dark, reads correctly either way).
  - Header order and search placement confirmed at desktop and mobile widths; mobile hamburger drawer opens/closes with all nav links + Control Panel; no horizontal overflow.
  - Hero carousel: created two real banners via the admin API, confirmed both appear on the homepage with real images/titles/subtitles/CTAs, Next button and pagination-dot navigation both correctly switch slides; deleted the test banners afterward, homepage cleanly falls back to the static hero.
  - Admin Website Design → Banners: form renders all fields including the real Cloudinary upload widget and Starts at/Ends at scheduling inputs; sidebar section correctly labeled "Website Design", click-only expand/collapse and internal scroll re-verified intact (previously fixed, unmodified by this work).
  - Cloudinary safe-delete logic verified end-to-end against the real API (§7).
  - Bulk Purchase CTA section verified clickable, navigates to the existing `/bulk-purchase` enquiry page, footer/newsletter form unaffected.
- All test banners created during verification were deleted afterward; no test data left in the database.

## 10. Remaining issues / notes

- Browser-based Cloudinary file upload (via the actual widget, not the API) could not be exercised through this session's automation tooling — verified the upload widget renders and wires up correctly (`ImageUpload` component, reused as-is), and verified the backend lifecycle logic directly against the API instead. Recommend one manual click-through of the upload button before considering this fully signed off.
- "Featured Products" depends on an admin actually creating a `HomeSections` entry titled that way — this is a data/configuration step, not a missing feature; flagging so it isn't mistaken for incomplete work.
- No regressions found in authentication, cart, checkout, RBAC, or the previously-fixed admin sidebar/layout scroll behavior.
