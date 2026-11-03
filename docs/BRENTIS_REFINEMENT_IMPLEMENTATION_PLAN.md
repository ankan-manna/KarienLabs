# BRENTIS HEALTHCARE — Refinement Implementation Plan (for Prompt 2)

**Status:** Ordered plan only. **Nothing in this document has been implemented.** Every item below is sourced directly from [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md), [`BRENTIS_IMAGE_DIRECTION.md`](./BRENTIS_IMAGE_DIRECTION.md), [`BRENTIS_DESIGN_SYSTEM.md`](./BRENTIS_DESIGN_SYSTEM.md) §12, and [`BRENTIS_UNSAVED_NAVIGATION_SPEC.md`](./BRENTIS_UNSAVED_NAVIGATION_SPEC.md) — no new claims are introduced here that aren't already backed by those documents.

---

## A. Priority order

1. **Section background rhythm** (§B) — highest-leverage, lowest-risk fix; directly addresses the measured "monotone" root cause with zero new content/assets needed.
2. **Vision & Mission real copy** (§C) — a genuine content gap that's now closed (real text exists in `aboutus.txt`), pure win, no design risk.
3. **Product card button treatment** (§D) — addresses the measured card-density gap at its actual source.
4. **Footer/header polish items** (§E) — lower-impact, lower-risk cosmetic alignment.
5. **Unsaved-navigation protection** (§F) — new capability, larger surface area, sequenced after the visual items since it touches shared components and both customer + admin surfaces.
6. **Blog section** (§G) — content-dependent, sequenced last since it needs a business decision first (§G.1).

## B. Section background rhythm (About, Categories, Products, Knowledge, Why-BRENTIS)

- Apply `bg-main`/`bg-section` alternation across the 5 currently-transparent sections in `HomePage.tsx`, using only the two already-defined tokens (`#FFF7F2`/`#081C20` and `#FFF0E8`/`#0D282D`) — no new color introduced.
- Suggested alternation (not prescriptive — Prompt 2 should eyeball the actual result, not apply this blindly): Hero (unchanged, dark) → About (`bg-section`) → Categories (`bg-main`) → Values (`bg-section`, already correct) → Products (`bg-main`) → Knowledge (`bg-section`) → Why-BRENTIS (`bg-main`) → Trust (white, already correct) → Newsletter (white, already correct).
- Each section that gains a background should also gain the same `rounded-3xl`/`rounded-[24px]` + padding treatment the Values/Trust/Newsletter sections already use, for visual consistency (copy the existing pattern, don't invent a new one).
- **Risk: low.** Pure CSS/className changes to an already-implemented page; no new data dependency, no new component.

## C. Vision & Mission real copy

- Replace the current honest "coming soon" placeholder in `AboutSection`'s "Our Vision & Mission" block with the real sentence from `aboutus.txt`: *"To build a trusted and progressive healthcare and wellness company that improves everyday lives through quality, innovation, and responsible care."*
- **Before implementing, resolve the tagline discrepancy flagged in `BRENTIS_IMAGE_DIRECTION.md` §1** ("MINDS THAT CARE" vs. "Mind That Cares") and the contact-email-domain discrepancy (`brentishealthcare.com` vs. `Brentislabs.com`) with the business owner — do not let either slip into live copy via this change without a definitive answer, since the Vision sentence itself doesn't use either disputed string and can ship independently, but adjacent About-page copy elsewhere in the app does use the tagline and shouldn't be touched piecemeal.
- **Risk: low.** Pure copy change, source text already verified real and business-authored.

## D. Product card button treatment

- The measured gap (BRENTIS: two 34px buttons side-by-side; Brintoncare: one 44px button) is the actual density driver, not card size. Options for Prompt 2 to choose between (not prescribing one): (a) keep both buttons but make "Buy now" visually secondary/smaller, (b) move "Buy now" to the PDP only and keep a single primary "Add to cart" on the card (closest match to the reference), (c) collapse to an icon-only secondary action. Whichever is chosen, re-measure against the same 1:1 image-area/card-footprint numbers in `BRENTIS_VISUAL_AUDIT.md` §G afterward to confirm the change actually closes the density gap rather than just moving it.
- **Risk: low-medium.** Touches `ProductCard.tsx`, which is shared across PLP/PDP-related/cart/homepage — any change must be verified at every one of those call sites, not just the homepage.

## E. Footer/header polish

- Already-correct and **not to be changed**: header dark-navy color (deliberate brand choice), payment-method text row (already added), no accreditation badges (correct, none are real).
- Nothing else is flagged as needing change in the header/footer per the measured comparison — this section exists to explicitly record that, not to manufacture busywork.

## F. Unsaved-navigation protection

Implement exactly per [`BRENTIS_UNSAVED_NAVIGATION_SPEC.md`](./BRENTIS_UNSAVED_NAVIGATION_SPEC.md):
1. New `useUnsavedChangesGuard` hook + new `UnsavedChangesDialog` component (new files, no existing shared component modified in place beyond what it composes).
2. Wire into customer `Header.tsx`'s logo `<Link>` and the account-area `Sidebar.tsx` logo.
3. Resolve the two open questions (spec §7) with the business owner before wiring the Admin/Super Admin logo, since it isn't clickable today and making it so is new behavior, not a restoration of existing behavior.
4. Add `isDirty` tracking to the representative forms identified in the spec (`ProductFormDrawer`, `ConfigEntityPage`, `ProfilePage`, `PrescriptionsPage`) — start with 1–2 real forms, confirm the pattern works end-to-end (including the async-save path on `PrescriptionsPage`), then roll out to the rest rather than touching every form at once.
5. `CheckoutPage`'s in-flight-payment state gets its own, simpler block-only treatment (spec §5), not the generic dialog.
6. Add `beforeunload` (refresh/close) and `popstate` (browser back) handling as the spec's §7.3 describes.
- **Risk: medium.** New shared UX pattern touching both customer and admin forms; must not regress any existing save flow (validation, async mutation, error surfacing) — the guard should only ever *add* a pre-navigation checkpoint, never change what happens once Save is actually triggered.

## G. Blog section — content audit (from `BLOGS.docx`, read in full)

### G.1 The decision this section is blocked on
`BLOGS.docx` contains **5 complete, genuine, SEO-ready articles** (title, meta description, URL slug, full body, FAQ, medical/regulatory disclaimer) written for 5 specific BRENTIS products — ACV Effervescent Tablets, Vitamin C + Zinc Effervescent Tablets, Glutathione + Vitamin C Effervescent Tablets, Sea Buckthorn Juice, Shilajit Resin. **None of these 5 products exist in the current seeded catalog**, which is a general OTC/prescription pharmacy assortment (Paracetamol, Metformin, etc. — see `BRENTIS_IMAGE_DIRECTION.md` §3). The document itself carries an explicit publishing caveat: *"verify every product-specific statement against the actual formulation, label, applicable FSSAI classification and supporting evidence"* before publishing — these are educational drafts, not pre-cleared final copy.

**This section cannot be safely planned further until the business owner confirms**: are these 5 wellness-supplement articles meant to replace the current 5 generic pharmacy blog posts, or are they for a future, separate product line? Proceeding with either without that confirmation risks publishing product claims for SKUs that don't exist in the store, or discarding content the business already paid to have written.

### G.2 What can proceed regardless of that decision
- **Compact editorial card layout**: Brintoncare's reference pattern (horizontal carousel, prev/next arrows, photo + category tag + title) is a reasonable target once real cover photography exists for whichever 5 (or more) posts are confirmed live — this is a layout change independent of which content set is used.
- **Image sourcing**: the current 5 demo blog posts' cover images are served from the same Cloudinary account (`dqdbmfdlt`) that previously hosted the now-fixed placeholder-graphic product images — **worth verifying whether these are real photography or similarly generated placeholders** before building a photo-forward card layout around them; not confirmed either way in this audit (flagged, not asserted).
- **Do not fabricate article content, medical claims, or cover photography** for either content set — the real BLOGS.docx articles already carry real FAQs/disclaimers and should be used verbatim (with the publishing-verification caveat honored) if the 5-product pivot is confirmed; the current generic demo posts should stay as-is until then.

## H. Explicitly out of scope for Prompt 2 (per this workflow's own rules, restated)

- No admin layout/sidebar/topbar/styling/business-logic changes beyond the one new logo-click wrapper described in §F.
- No catalog restructuring (demo pharmacy SKUs vs. real 5-product wellness line) without business confirmation — that decision gates §G and much of `BRENTIS_IMAGE_DIRECTION.md` §3-4, but isn't this plan's to make.
- No tagline change (singular vs. plural "Mind(s) That Care(s)") without business confirmation.
- No contact-email-domain change without business confirmation.
- No fabricated certifications, press mentions, store partnerships, or international-presence claims (unchanged rule from every prior prompt in this project).
