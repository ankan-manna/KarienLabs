# Storefront Redesign + Admin Layout/Sidebar Fix

## 1. Files/components changed

**New:**
- `apps/web/src/components/layout/Header.tsx` — extracted from `PublicLayout.tsx`, with a real search input and a mobile nav menu (neither existed before).

**Customer storefront:**
- `apps/web/src/layouts/PublicLayout.tsx` — now just composes `Header` + `Outlet` + `Footer`.
- `apps/web/src/modules/storefront/pages/HomePage.tsx` — hero, category tiles, new Offers strip, new Trust section, minor consistency polish on TopBrands.
- `apps/web/src/modules/storefront/components/ProductCard.tsx` — visual refresh, brand name, Buy Now.
- `apps/web/src/modules/storefront/pages/SearchResultsPage.tsx` — reads/writes `?q=` so the header search can hand off to it.
- `apps/web/src/api/products-public.api.ts` — added `brandName?: string | null` to `PublicProduct`.

**Admin/account layout (the scroll bug):**
- `apps/web/src/layouts/AdminLayout.tsx`
- `apps/web/src/layouts/CustomerLayout.tsx` (same bug, same fix — shares `Sidebar`/`Topbar` with Admin)

**Backend (one small, contained addition):**
- `apps/api/src/modules/catalog/product.service.ts` — `listProducts` now batch-resolves brand names for the page (Part 6: "smallest safe change" needed for the card's "Brand if available" requirement).

**Untouched, confirmed already correct** (per research before touching anything): `ProductDetailPage.tsx`'s image gallery (thumbnails/main-image-swap/zoom), `Footer.tsx`, `Sidebar.tsx`'s accordion submenu (fixed in the prior session — verified still correct here), cart/checkout/payment/Shiprocket/inventory/prescription/RBAC/Cloudinary/S3 logic, `SuperAdminLayout.tsx` (a pass-through to `AdminLayout`, fixed automatically).

## 2. UI changes made

**Header** — real search box (`"Search medicines, health products & more"`) instead of a bare nav link; a mobile hamburger menu, since none existed before (Products/Offers/Blog/About/Bulk Purchase were previously **unreachable below the `sm` breakpoint** — confirmed via research, not assumed); sticky positioning.

**Hero** — replaced the flat single-color block with a two-tone gradient, a "Verified pharmacy partners" trust chip, a headline/subtext/two-CTA layout, and an inline SVG healthcare illustration (no external image asset, no layout shift). The CMS-banner override path (an admin-configured hero image) is unchanged and still takes priority.

**Category cards** — every category previously showed the identical 💊 emoji. Now: `Category.imageUrl` (a real, pre-existing backend field that was completely unused on the frontend) is used when an admin has set one; otherwise a deterministic-per-category icon from a 12-icon healthcare set replaces the single repeated emoji. Hover lift + shadow. Same tile reused for the CMS-configurable `category_grid` home section, which previously had no icon at all.

**Product cards** — image now fills a square aspect ratio (was a fixed `h-40`, cropped oddly); a green discount ribbon; brand name (new, see §4); Add to Cart (gradient) **and** Buy Now (outline) side by side, Buy Now only rendered when in stock; Rx/Out-of-Stock badges moved onto the image as pills for faster scanning. Out-of-stock state disables Add to Cart and never renders Buy Now — no misleading availability.

**Offers strip** — new homepage section, reusing the exact same public `getPublicBanners('category')` call `OffersPage.tsx` already used (real CMS data; renders nothing if none configured — no fake content).

**Trust section** — new static "Why shop with KarienLabs" strip (genuine products / secure payments / reliable delivery / quality healthcare / support) — no unsupported medical claims, no backend dependency.

**Admin/account sidebar layout** — sidebar and top header now stay in place while the page's own content area scrolls (see §3).

## 3. CSS/layout architecture changes

The admin scroll bug's root cause (confirmed by reading the actual rendered classes, not guessed): `AdminLayout.tsx`'s root wrapper was `min-h-screen` (a *minimum*, not a cap) inside a `flex` row, and the right-hand column had **no height class at all**. When page content exceeded one viewport, that column simply grew taller than `100vh` instead of clipping — dragging the whole document (sidebar and topbar included, since neither had `sticky`/`fixed` positioning) into the browser's own scroll, while `<main>`'s `overflow-y-auto` never got the chance to engage.

Fix: root wrapper changed to `h-screen overflow-hidden` (a hard cap, not a minimum), and the inner column gets `min-h-0` — flex items default to `min-height: auto` ("never shrink below content size"), which is precisely what was silently preventing `flex-1 overflow-y-auto` on `<main>` from ever clipping. With both in place, `<main>` becomes the *only* scrolling region; `<aside>`/`<header>` need no `sticky`/`fixed` at all, since as plain flex siblings of a now-bounded, non-scrolling ancestor they simply never move. One scroll region, no double scrollbars — applied identically to `CustomerLayout.tsx`, which shared the exact same bug via the same `Sidebar`/`Topbar` components.

No other layout architecture changed. The sidebar's own click-to-expand accordion submenu (Part 3 of this prompt) was already fixed and verified in the immediately preceding session — re-verified here to still be correct, not re-implemented.

## 4. API changes (minimal, and why)

`GET /products` (the endpoint powering New Arrivals, category listings, search, and the general product list) previously never resolved brand names — only `product.brandId`. Only the single-product detail endpoint did that lookup. Part 1 explicitly asks for "Brand if available" on cards, and Part 6 explicitly permits a small API adjustment when the UI genuinely needs it.

Added a batched brand-name lookup to `product.service.ts::listProducts`, following the **exact same pattern already used one line above it** for stock availability (`resolveProductAvailability`) — one query for the whole page's unique brand IDs, not one query per row. Response gains one new optional field per item: `brandName: string | null`. Nothing existing was removed, renamed, or made required; every other field and the response envelope are unchanged.

## 5. Validation/testing performed

- `npm run typecheck` — clean on both `@medcommerce/web` and `@medcommerce/api`.
- `npm run lint` — 0 errors on both (same pre-existing, unrelated warnings as before this session).
- `npm run test` (API unit) — **276/276 pass**.
- `npm run test:integration` (API) — **200/200 pass** (run after the `brandName` backend change, to catch any regression from touching `listProducts`).
- Live browser, desktop (1280px) and mobile (375px), light and dark mode:
  - Homepage: hero, category tiles (varied icons confirmed, not repeated), New Arrivals, Trust section, footer all render correctly with real backend data; sections with no data (Offers, TopBrands, Reviews, Blog — none seeded in this dev DB) correctly render nothing rather than fake placeholders.
  - Product detail page: gallery thumbnails + main-image swap re-confirmed working (clicked a thumbnail, main image and border-highlight updated correctly) — untouched, exactly as researched.
  - **Full purchase flow, logged in as a real customer**: clicked Add to Cart on `/products` → "Added to cart" toast + cart badge updated to 1. Clicked Buy Now on a second product → added + navigated straight to `/checkout`, which rendered the existing, unmodified Delivery Address / Order Summary page correctly.
  - Header search: typed "paracetamol", submitted → navigated to `/search?q=paracetamol` → `SearchResultsPage` picked up the query from the URL and returned 3 real matching products, using the existing `globalSearch` API unchanged.
  - Mobile: hamburger menu opens/closes correctly with all 5 nav links (previously unreachable on mobile at all); confirmed `document.documentElement.scrollWidth === window.innerWidth` (no horizontal overflow) on the homepage.
  - Admin scroll fix, programmatically verified (not just visually): with a real super-admin session, set `main.scrollTop = 400` and confirmed `window.scrollY` stayed `0` and `aside`'s bounding-rect `top` stayed `0` before and after — the sidebar genuinely never moves, `document.body.scrollHeight === window.innerHeight` (capped, no page-level overflow). Repeated the same check on `/account` (`CustomerLayout`), same result.
  - RBAC: unauthenticated Add to Cart correctly fails with a 401 (pre-existing, unchanged auth requirement — confirmed via console, not a new bug).
- Two temporary test accounts (one super_admin, one customer) were created directly in the local dev database for this verification, since real credentials had already been rotated by a prior session; both were deleted after testing.

## 6. Remaining issues / notes

- **Category images**: `Category.imageUrl` is now rendered when set, but there is still no admin UI to actually upload/set one (confirmed via research: zero image field on the admin Categories page). Left out of scope deliberately — building a full Cloudinary-backed category-image upload flow is a materially bigger change than this prompt's "primarily UI/UX" framing, and the icon-variety fallback already resolves the prompt's explicit complaint ("do not use repeated generic capsule emojis") without it. Flagging it as a natural follow-up if real category photography becomes available.
- **Offers section is currently empty** in this dev environment because no `'category'`-placement CMS banners are configured — this is correct, data-driven behavior (Part: "do not create fake data"), not a bug; it will populate as soon as an admin adds banners via the existing CMS Banners page.
- Nothing else outstanding — no known regressions, no broken existing flow found during testing.
