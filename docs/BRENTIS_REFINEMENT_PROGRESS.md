# BRENTIS HEALTHCARE — Refinement Workflow Progress

**This is a new, separate tracker for the "live inspection, debugging, design audit" workflow** (distinct from [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md), which tracks the earlier branding/rebuild/guest-cart workflow). Read this file at the start of each prompt in *this* workflow; update it at the end of each.

## Prompt 1 — Live inspection, tooling, audit, planning (complete)

**Scope:** research and documentation only. Confirmed via `git status` at the end of this prompt that zero application source files were modified — only `docs/*.md` were added/edited.

### Completed
- [x] Read all 3 business documents in full (`aboutus.txt`, `BLOGS.docx`, `WEBSITE DOCUMENTATION.docx` via `python-docx` extraction — `pandoc`/`soffice` were unavailable in this environment, `python-docx` was already installed and used instead).
- [x] Attempted Chrome DevTools MCP install exactly per the documented marketplace workflow; **root-caused and documented why it cannot complete in this environment** (its `third_party/devtools-frontend` submodule recursively pulls a full LLVM/Chromium source checkout — multi-GB, not a timeout problem). Used the already-available, already-proven `mcp__Claude_Browser__*` tool as the explicitly-sanctioned working alternative.
- [x] Checked Claude in Chrome: tool schemas registered, but `list_connected_browsers()` returned empty — no actual extension connected, not used, not treated as a blocker.
- [x] Verified `frontend-design` (Apache 2.0, already present) and installed+verified `ui-ux-pro-max@ui-ux-pro-max-skill` v2.15.0 (MIT, lightweight, confirmed via `claude plugin list`).
- [x] Evaluated `frontend-audit-skill`; declined to install (confirmed ~300MB Chromium + optional ~3GB Python ML stack via its own documented dependency list) — not needed given the working alternative above.
- [x] Ran and passed all 10 steps of the browser-inspection acceptance test on both `brintoncare.com` and `localhost:5173`, with real `getBoundingClientRect`/`getComputedStyle`/`naturalWidth`/console/network evidence for each step.
- [x] Measured Brintoncare at 1440/1280/768/390px — header, hero, About (corrected: 1 photo not 2), categories, differentiation, press strip (corrected: 5 logos not 4), product cards, footer.
- [x] Measured BRENTIS at the same breakpoints with the same methodology, including catching and correcting a self-inflicted dark-mode artifact mid-audit (stale `localStorage['mc_theme']` from a prior turn's manual QA toggle).
- [x] Produced a measured comparison table with a concrete, mechanical root cause for "feels monotone" (5 of 9 homepage sections render with no section-level background at all) — not a guess.
- [x] Extracted real, business-authored Vision & Mission copy from `aboutus.txt` — **closes a previously-tracked content gap** from the prior workflow.
- [x] Found and flagged (not resolved) two real discrepancies in the source documents themselves: tagline singular/plural, contact-email domain.
- [x] Found the real BRENTIS product line (5 wellness-supplement SKUs, fully written blog content in `BLOGS.docx`) does not match the currently-seeded demo pharmacy catalog — flagged as a business decision, not resolved unilaterally.
- [x] Researched current logo-navigation and form/routing architecture (plain `<BrowserRouter>`, no data router, no existing dirty-state pattern anywhere) and produced a full Save/Discard/Cancel spec that works within that constraint (no `useBlocker` dependency).
- [x] All 7 required documents created: this file, [`BRENTIS_BROWSER_TOOLING_VERIFICATION.md`](./BRENTIS_BROWSER_TOOLING_VERIFICATION.md), [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md), [`BRENTIS_IMAGE_DIRECTION.md`](./BRENTIS_IMAGE_DIRECTION.md), [`BRENTIS_DESIGN_SYSTEM.md`](./BRENTIS_DESIGN_SYSTEM.md) (§12 appended, §1–11 preserved unchanged), [`BRENTIS_UNSAVED_NAVIGATION_SPEC.md`](./BRENTIS_UNSAVED_NAVIGATION_SPEC.md), [`BRENTIS_REFINEMENT_IMPLEMENTATION_PLAN.md`](./BRENTIS_REFINEMENT_IMPLEMENTATION_PLAN.md).

### Explicitly not done in this prompt (by design — research only)
- No CSS/component changes (section backgrounds, product card buttons, etc. — all specified, none implemented).
- No Vision & Mission copy wired in yet.
- No unsaved-changes guard built yet.
- No tagline or contact-email decision made.
- No catalog/blog-content decision made.

### Open questions for the business owner, carried into Prompt 2
1. Tagline: "Mind That Cares" (singular, used throughout the existing site) vs. "MINDS THAT CARE" (plural, used 3× in `aboutus.txt`) — which is correct?
2. Support email domain: `brentishealthcare.com` (`aboutus.txt`) vs. `Brentislabs.com` (`WEBSITE DOCUMENTATION.docx`, used throughout all 6 policy documents) — which is live?
3. Catalog direction: is the real BRENTIS launch line the 5 wellness-supplement products described in `BLOGS.docx` (ACV/Vitamin C+Zinc/Glutathione effervescent tablets, Sea Buckthorn Juice, Shilajit Resin), replacing the current demo pharmacy catalog — or are these two separate, both-real product lines?
4. Should the Admin/Super Admin logo become clickable at all (it isn't today)?
5. Is "BRENTIS" meant to read as a sub-brand of "Brentis Healthcare" (as `BLOGS.docx` repeatedly states) rather than the current single flat brand name?

### Pending implementation (ordered plan in `BRENTIS_REFINEMENT_IMPLEMENTATION_PLAN.md`)
1. ~~Section background rhythm fix~~ — done, Prompt 2.
2. ~~Vision & Mission real copy~~ — done, Prompt 2.
3. ~~Product card button-density fix~~ — done, Prompt 2.
4. ~~Unsaved-navigation protection~~ — done, Prompt 2 (core system + 2 representative forms; full rollout to remaining forms still pending, see below).
5. Blog section — cover images fixed (Prompt 2); full content swap to the real 5-product wellness articles still blocked on the catalog-direction decision (§Open questions item 3).

---

## Prompt 2 — Premium UI refinement, unsaved-nav system, final QA (complete)

**Scope:** implementation, grounded directly in Prompt 1's measurements. Verified via `git status`/`git diff` that every change is additive and scoped to the files listed below — no `apps/web/src/modules/admin/**` or `apps/web/src/modules/superadmin/**` source file was touched, and no existing admin CSS/layout class changed (confirmed by diff: `AdminLayout.tsx` +1 line, `Sidebar.tsx` +18/-2 lines, both purely logic, zero className changes).

### Design skills used
- `ui-ux-pro-max` search tool queried for e-commerce card/editorial-layout guidance (`search.py "healthcare ecommerce product card editorial" --design-system`, plus targeted `ux`/`product` domain queries) — used as a secondary input; the primary grounding for every visual decision was Prompt 1's real Brintoncare/BRENTIS measurements, per this prompt's own instruction not to blindly follow generic suggestions.
- `frontend-design` principles (restrained accents, real content-driven hierarchy, no decorative numbered markers without a real sequence) applied throughout.

### 1. Section background rhythm (the measured "monotone" root cause, fixed)
`HomePage.tsx`: About, Selected Products, and Why-BRENTIS sections now use the existing `bg-deep-teal` token (resolves to the real `#FFF0E8`/`#0D282D` Section-bg color — confirmed via `tailwind.config.js`, not a new color) wrapped in `rounded-3xl` padded containers, matching the pattern already used correctly by the Trust/Newsletter sections. Categories and Knowledge sections intentionally blend with the page background (alternating pattern), mirroring Brintoncare's own measured white/tinted alternation. **Live-verified**: real visible color banding now present scrolling down the page (previously 5 of 9 sections were fully transparent).

### 2. Values/Differentiation section — merged, not just recolored
Investigated the "avoid a large dark panel with four oversized text columns" instruction directly in code (not from memory): found two separate, redundant sections — `ValuesSection` ("Our Philosophy", 4 numbered tiles) and `WhyBrentisSection` ("Why BRENTIS", already an editorial image+list layout built in the prior workflow). Their content overlapped almost entirely (Quality & Trust / Customer-First / Responsible Healthcare / Transparency vs. Verified Sourcing / Secure Checkout / Tracked Delivery / Prescription-Aware — both are "why trust us" lists). **Removed the redundant `ValuesSection` entirely** rather than just recoloring it — this both eliminates the generic-card-grid redundancy (section 4's "Avoid: Too many boxed sections") and shortens the page (5,609px vs. ~6,850px total scroll height measured before). `WhyBrentisSection` (the one true editorial Values/Differentiation section, already matching the reference's text+list+photo composition) was kept and given the same section-bg tint treatment as #1 above.

### 3. Vision & Mission — real content gap closed
`AboutSection`'s "Our Vision & Mission" block now carries the actual sentence from `aboutus.txt`: *"To build a trusted and progressive healthcare and wellness company that improves everyday lives through quality, innovation, and responsible care."* — closing a gap flagged in two prior prompts. Did **not** touch the disputed tagline ("Mind That Cares" vs. "MINDS THAT CARE") or support-email domain anywhere — both remain open questions for the business owner, per `BRENTIS_IMAGE_DIRECTION.md` §1.

### 4. Product card — measured, verified improvement
| | Before (measured, Prompt 1) | After (measured, Prompt 2) | Reference (Brintoncare) |
|---|---|---|---|
| Card | 325×468px | **309×450px** | 278×486px |
| Buttons | 2 (34px each, "Add to cart" + "Buy now") | **1 (32px, "Add to cart" only)** | 1 (44px, "View Options") |

Root cause (identified in Prompt 1's audit): the two-button row, not raw card size, was the actual density driver. "Buy now" was removed from `ProductCard.tsx` only — it remains fully available on the PDP's own purchase actions, so no functionality was lost, only the duplicate card-level affordance. `useNavigate`/the now-unused `onAdded` callback parameter were cleaned up rather than left dead.

### 5. Blog section — placeholder images fixed at the root
Found (by opening the asset directly, not assuming) that the 5 seeded blog posts' cover images were the same class of generated-placeholder graphic (solid color box + title baked into the pixels) previously root-caused and fixed for product images. Swapped all 5 to real, individually-verified, unbranded stock photography matching each article's real topic — in both `migrate-demo-content.ts` (future re-seeds) and the already-seeded local database (immediate fix, same pattern as the earlier product-image fix). Did **not** swap the blog post *content* to the 5 real wellness-product articles from `BLOGS.docx` — that remains gated on the catalog-direction decision (`BRENTIS_REFINEMENT_PROGRESS.md` §Open questions item 3), since those articles reference specific products not in the current catalog.

### 6. Logo navigation + unsaved-changes protection (CRITICAL — fully built and live-verified)
**New files:**
- `context/UnsavedChangesContext.tsx` — `UnsavedChangesProvider` (mounted once, in `main.tsx`, inside `BrowserRouter`/`AuthProvider`) + `useUnsavedChangesGuard(guard)` hook any form registers with + `useUnsavedChangesContext()` for the logo-click sites. Uses a ref (not state) for the dirty flag so a form's keystrokes never re-render anything outside itself. Includes a `beforeunload` listener for real tab-close/refresh protection (native browser prompt, zero interference with normal navigation).
- `components/common/UnsavedChangesDialog.tsx` — the exact-copy Save/Discard/Cancel dialog, composing the existing `Modal` primitive (not a new modal system).

**Wired into:**
- `components/layout/Header.tsx` (customer logo) — `onClick` checks the guard; falls through to the `<Link>`'s normal instant navigation with zero added latency when nothing is dirty.
- `components/layout/Sidebar.tsx` (shared by customer account area + admin) — same pattern, composed with the sidebar's existing `onCloseMobile` click behavior.
- `layouts/AdminLayout.tsx` — now passes `logoHref="/admin"` (previously **not clickable at all** — confirmed via Prompt 1's research; this is genuinely new behavior, not a restored one), satisfying this prompt's explicit "Admin logo must navigate to the admin dashboard" requirement. `SuperAdminLayout` inherits this automatically (it renders `AdminLayout` directly).

**Representative forms wired** (per the spec's own "start with 1-2 real forms" phased rollout — not yet all forms):
- `modules/admin/catalog/components/ProductFormDrawer.tsx` (react-hook-form + zod) — `onSave` triggers the real `handleSubmit(onSubmit)`, including the exact same validation and create/update mutation; rejects (keeping the user on the form) if validation fails.
- `modules/customer/pages/ProfilePage.tsx`'s `ChangePasswordCard` (plain `useState`) — refactored so the form's own submit button and the guard's `onSave` call one identical `submitPasswordChange()` function, never two save paths.
- **`PrescriptionsPage` was investigated and deliberately NOT wired**: reading its actual code revealed the upload starts immediately on file selection (no separate "fill then click Save" step), so there's no dirty-but-unsaved window to guard — it doesn't fit this pattern, and forcing it in would have been fake coverage, not a real improvement. Documented here instead of silently claiming it was done.
- Browser **back-button** protection was investigated (a "push a duplicate history entry, intercept popstate" technique) and deliberately **not implemented** — the risk of this interfering with normal back-navigation site-wide (verified only through live interaction, not something safely testable in the time available) was judged higher than the value of partial, unverified coverage. `beforeunload` (refresh/close) is fully implemented and safe. This is a known, disclosed gap, not a silent omission.

**Live-verified in the browser, both customer and admin surfaces, all three dialog actions:**
- Customer (`/account/profile`, Change Password): dirty form + logo click → dialog opens, exact title/body copy confirmed. **Cancel**: dialog closes, stays on `/account/profile`, field value fully preserved (`newPasswordValue` read back unchanged). **Discard Changes**: navigates to `/` immediately. **Save Changes with mismatched passwords**: dialog stays open, inline error "Passwords do not match" shown, URL stays `/account/profile` — confirmed the validation-failure contract exactly.
- Admin (`/admin/catalog/products`, New Product drawer): dirty form + admin logo click → dialog opens, stays on `/admin/catalog/products`. **Discard Changes**: navigates to `/admin/dashboard` — confirmed admin users are never redirected to the customer homepage, per the explicit requirement.

### 7. Regression testing — actually executed, results below
| Suite | Result |
|---|---|
| `npm run typecheck` (api + web) | Clean, 0 errors |
| `npm run lint` (api + web) | 0 errors (pre-existing warnings only, unchanged count) |
| `npm run test` (api unit) | **279/279 pass** |
| `npm run test:integration` (api, incl. all 9 guest-cart tests) | **220/220 pass** — zero regressions from the `ProductCard`/`ProfilePage` changes |
| `npm run build` (web production build) | Succeeds, no errors |
| Guest cart | Spot-checked unaffected (no cart-logic files touched this prompt) |
| Admin visual regression | Live screenshot of `/admin/dashboard` and `/admin/catalog/products` — pixel-identical to pre-Prompt-2 (same sidebar, same KarienLabs branding, same layout); only the logo is now a real link |
| SEO | Homepage `<title>`, meta description, canonical, OG tags, `Organization`+`WebSite` JSON-LD all confirmed present and unchanged (`document.title`/`meta`/`script[type=application/ld+json]` read directly) |
| Docker | Local dev stack (`medcommerce-dev-*` containers) confirmed still healthy/running throughout, uptimes unaffected — no container restarts required by this prompt's changes; root `docker-compose.yml` still validates clean via `docker compose config -q` |
| Mobile overflow | `document.documentElement.scrollWidth === clientWidth` confirmed at both 768px and 390px — zero horizontal overflow |

### Files changed this prompt
`apps/web/src/modules/storefront/pages/HomePage.tsx`, `apps/web/src/modules/storefront/components/ProductCard.tsx`, `apps/api/src/scripts/migrate-demo-content.ts` (blog cover images), `apps/web/src/main.tsx`, `apps/web/src/components/layout/Header.tsx`, `apps/web/src/components/layout/Sidebar.tsx`, `apps/web/src/layouts/AdminLayout.tsx`, `apps/web/src/modules/admin/catalog/components/ProductFormDrawer.tsx`, `apps/web/src/modules/customer/pages/ProfilePage.tsx` — plus 2 new files: `apps/web/src/context/UnsavedChangesContext.tsx`, `apps/web/src/components/common/UnsavedChangesDialog.tsx`.

### Known remaining gaps (disclosed, not hidden)
- Unsaved-changes guard not yet rolled out to every form (`ConfigEntityPage.tsx` and its many CRUD consumers, the rest of `ProfilePage.tsx`'s sections, `CheckoutPage.tsx`'s distinct in-flight-payment case) — 2 representative forms proven working end-to-end; full rollout is mechanical repetition of the same pattern, not a design risk, but real remaining work.
- Browser back-button protection not implemented (disclosed above, §6).
- Blog post *content* still the generic demo set, not the real 5-product wellness articles (blocked on business decision).
- Tagline and support-email-domain discrepancies still unresolved (require business owner input, not an engineering decision).
- Local dev super-admin test account's password was reset to a known QA value (`AdminQA-Test-123!`) to enable live admin verification in this prompt — local dev database only, not production/Atlas.

---

## Prompt 4 — Brintoncare responsive parity, Best Sellers tabs, CMS end-to-end verification (complete)

**Scope:** measured mobile/desktop parity fixes against the live Brintoncare reference, a new Best Sellers category-tab feature, and an actually-performed (not assumed) CMS end-to-end verification cycle. See `docs/BRENTIS_FINAL_REFERENCE_PARITY_AUDIT.md` and `docs/BRENTIS_FINAL_VISUAL_QA.md` for full measurement detail.

### Sections refined
- **Shop by Category (highest-impact fix)**: mobile (<640px) switched from a forced horizontal-scroll row to a 2-column CSS grid, matching Brintoncare's own measured mobile behavior exactly (174×242px cards, confirmed via live `getBoundingClientRect()` on the reference). Desktop/tablet single-row behavior unchanged. Card aspect ratio standardized to `283:395` everywhere.
- **About Us**: mobile/tablet DOM order fixed (heading/copy now renders before the image, matching the reference's reading order — was image-first); mobile image height tightened (288px→224px), section gap tightened.
- **Best Sellers**: new feature — was previously a single static "Selected Products" row with no category navigation. Now a tabbed section (4 real BRENTIS categories: Pain Relief & Fever / Vitamins & Supplements / Personal Care / Wellness & Heart Health), admin-configurable via a new `category_tabs` HomeSection type, products always resolved live from the real catalog. Live-verified: clicking a tab changes the rendered products.

### Components changed
- `apps/web/src/modules/storefront/pages/HomePage.tsx` — `CategorySection` (mobile grid), `AboutSection` (stacking order/spacing), `SelectedProductsSection` replaced with `BestSellersSection` + `ProductGridRow`.
- New: `apps/web/src/modules/admin/cms/components/HomeSectionCategoryFields.tsx` (ordered category picker for `category_grid`/`category_tabs` HomeSection types).
- `apps/web/src/modules/admin/cms/pages/HomeSectionsPage.tsx` — added the "Category Tabs (Best Sellers)" type option + the new picker field.

### Backend changes
- `apps/api/src/modules/cms/models/home-section.model.ts` — added `'category_tabs'` to the `type` enum.
- `apps/api/src/modules/cms/cms.validators.ts` — matching zod enum update.
- `apps/api/src/modules/cms/public-cms.routes.ts` — `/home-sections` now resolves per-category products live for `category_tabs` sections (never stored on the record), extends the existing stock-resolution batch to cover them.
- `apps/api/src/scripts/migrate-demo-content.ts` — seeds one real `category_tabs` HomeSection (idempotent, reused real categories).

### Design skills / tooling
Chrome DevTools MCP remains uninstallable (re-confirmed, same root cause as before). Used the Browser pane's own DOM-inspection tools throughout — real `getBoundingClientRect()` reads on both `brintoncare.com` and `localhost:5173` at matching viewports, not screenshot-only comparison.

### CMS end-to-end test results (actually performed, see `BRENTIS_DYNAMIC_CMS_AUDIT.md` §11a for full detail)
- Real signed Cloudinary upload → DB save → customer-page-reflects-it cycle performed against Category images using the live admin API (not a mock). **Found a real, previously undetected bug**: Cloudinary's Admin API (used for `destroy`/asset deletion and upload-preset management) fails on this account (`"Admin API error"`/`"Asset destroy failed"` in `api-third-party-api-*.log`), while the Upload API (actual file upload, signature generation) works correctly. The application-level safe-replace logic is confirmed correct (right data, right timing, orphan-check works) — the failure is one level below, in Cloudinary's own Admin API responding with an error for this account. Practical impact: replaced images are no longer referenced but are NOT actually deleted from Cloudinary storage. No customer-facing or data-integrity impact.
- Best Sellers tab-switch verified live (real DOM state change, not a static mock).
- Policy pages, About page, Hero, Category images, Footer all re-confirmed rendering real CMS data this session (no fresh bugs found in those paths).

### Test results
| Suite | Result |
|---|---|
| `npm run typecheck` (api + web) | Clean |
| `npm run lint` (web) | 0 errors, 7 pre-existing warnings |
| `npm run test` (api unit) | 279/279 pass |
| `npm run test:integration` (api, host-run) | 216/220 pass — 4 failures in the pre-existing "Address pincode validation" suite, caused by a TLS/self-signed-certificate error reaching the external postal-pincode API from this host environment; confirmed unrelated to this session's changes (stack trace is entirely inside `postal-pincode.client.ts`/`address-verification.service.ts`, neither touched this session) |
| `npm run build` (web) | Succeeds |

### Known remaining issues
- Cloudinary asset deletion (Admin API) failing on this account — see above, needs dashboard-level investigation outside this session's scope.
- Blog and Footer mobile layouts not independently re-measured against the Brintoncare reference this session (no issue observed, but not pixel-measured either — disclosed as an assumption, not a verified match).
- Desktop/tablet measurements for unchanged sections are carried forward from the Prompt-2-era audit rather than re-captured fresh this session (those sections didn't change, so re-measuring would reproduce identical numbers — but this is a methodological note worth being explicit about).
- The 4 integration-test failures above are environmental (TLS chain on this host), not application bugs — flagged rather than silently ignored.
