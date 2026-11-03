# BRENTIS HEALTHCARE — Measured Visual Audit (Brintoncare Reference vs. Current BRENTIS)

**Status:** Research only — no application code changed while producing this document. Every number below came from a real `getBoundingClientRect()`/`getComputedStyle()`/`naturalWidth` read, a real console/network log, or a real screenshot taken in this session — see [`BRENTIS_BROWSER_TOOLING_VERIFICATION.md`](./BRENTIS_BROWSER_TOOLING_VERIFICATION.md) for the tool-by-tool proof. Where this document's numbers refine or correct a prior session's reverse-engineering notes, that's called out explicitly rather than silently overwritten.

**Important correction made during this audit, disclosed rather than hidden:** the first pass of BRENTIS section-background measurements was accidentally taken with `localStorage['mc_theme'] = 'dark'` left over from the *previous turn's* manual dark-mode QA toggle — not the site's real default. This was caught by checking `localStorage.getItem('mc_theme')` directly (it read `"dark"`), cleared, and re-verified on a genuinely fresh tab (`localStorage.getItem('mc_theme')` → `"light"`, `document.documentElement.classList.contains('dark')` → `false`, body background → `rgb(255, 247, 242)` = `#FFF7F2`, the documented light "Main bg" token). **All findings below use the real, confirmed light-mode default** — the same one a genuine new visitor sees.

---

## A. Header

| Metric | Brintoncare (measured) | BRENTIS (measured) |
|---|---|---|
| Height @1440px | 79.2px | 66px |
| Height @1280px | 63px | *(not independently re-measured this session; unchanged from prior confirmation)* |
| Position | `fixed` | `sticky` |
| Background | `rgb(255,255,255)` white | `rgb(23,43,47)` dark navy (`#172B2F`) |
| Box-shadow | `rgba(196,196,196,.27) 0 1px 2px 0` (subtle) | *(not re-measured this session)* |
| Logo | `<img>` SVG, 117.9×39.0px | text+icon lockup, 233×28px |
| Nav items (desktop) | All Products / By Benefit / By Collection / Combo Offer / Skin Care / Hair Care / Foot Care / Baby Care / Gut Care / About us / Blogs / R&D (full mega-menu; top-level visible: ALL PRODUCTS / ABOUT US / BLOGS / R&D) | Products / Offers / Blog / About / Bulk Purchase |
| Search | **Decorative only at rest** — a 351×49.5px pill (`border-radius:30px`, `background:#F2F2F2`) containing an animated `<a>` with rotating placeholder text ("Search for Skin care" → "Hair care" → …), **not a real `<input>`** until clicked | Real, always-functional `<input>` with static placeholder "Search medicines, health products & more" |

**Assessment:** the header color difference (white vs. dark navy) is a **deliberate BRENTIS brand choice already matching the fixed palette spec**, not a defect — do not "fix" it to white. The logo and nav are structurally equivalent patterns (logo → nav → search → account/cart). The one genuine, reusable idea: Brintoncare's search pill never shows a blinking cursor/real field until interacted with, which is arguably *worse* UX than BRENTIS's always-functional search — **not a change to copy**.

## B. Hero

| Metric | Brintoncare (measured) | BRENTIS (measured) |
|---|---|---|
| Mechanism | Real `swiper mainSwiper swiper-creative swiper-3d` (Swiper.js, 3D/creative transition) | `HeroCarousel` (Framer Motion crossfade), dot pagination + prev/next arrows |
| Section size @1440 | 1440×473px | Full-bleed, ~420–472px tall per breakpoint (component-defined) |
| Pagination | Dots only, no visible arrow buttons in the accessible tree | Dots **and** prev/next arrow buttons |
| Slide content | 1 large product-collection photo + "No.1 Dermatologist Recommended" badge + "Discover more" CTA | 3 real, individually-verified text-free photos + badge + heading + subtitle + 2 CTAs per slide |

**Assessment:** structurally equivalent and already a real, working carousel on both sides — no further "fix" needed here; this was already implemented and live-verified in the immediately preceding work on this project.

## C. About Us — highest priority, re-measured with correction

**Brintoncare `.home-aboutus-sec`, 1440px:**
- **1 single photograph**, not a 2-photo collage as an earlier session's screenshot-based note assumed. Real DOM proof: only one `<img>` over 100px in the section — `dtan-img.webp`, **natural 990×1190px**, **rendered 409×492px**, `border-radius: 20px`. What reads as "two overlapping photos" (a product tube + an orange slice + a partial face) is the composition *within that single photograph*, confirmed by `querySelectorAll('img')` returning no second large image and no CSS `background-image` anywhere in the section.
- Two small decorative SVG accents (a 4-point sparkle, ~55×56px rendered; a hand-drawn squiggle, ~94×105px rendered) layered near the photo's corners.
- **4 info blocks** in a 2×2 grid, each with its own small SVG icon (26–33px rendered): **Core Values** (checkmark-style icon), **Vision & Mission** (target icon), **International Presence** (a literal UK flag icon — `uk.svg`), **Why us?** (heart icon). Each block: bold heading, 1–2 sentence description, thin bottom divider.
- Heading eyebrow "ABOUT US" at 14px/500 weight.
- At 1280px: image scales to 256×307px (same ~0.83 aspect ratio preserved). At 768px/390px: image stacks above the 2×2 block grid (grid itself stays 2-column, not full single-column, even on phones).

**BRENTIS `AboutSection` (`Care Beyond Products.`), same methodology:**
- 1 real photograph (vitamins/wellness flatlay, Unsplash, `w=1400&q=80` source), rendered at ~45% column width.
- 4 info blocks in a 2×2 grid: **Our Core Values**, **Our Vision & Mission** (honestly states a founder statement is pending rather than inventing one), **Our Commitment to Care**, **Why Choose BRENTIS** — each with a small line icon, heading, 1–2 sentence description, thin divider.
- Section background: fully transparent (`rgba(0,0,0,0)`) — just shows the page's own cream background underneath, no distinct section banding (see §E for why this matters).

**Verdict: structurally this is already a very close match** (1 photo + 4-block 2×2 grid, icon+heading+description+divider per block, same stacking behavior on mobile) — this gap was already closed in the immediately preceding implementation work on this project. The one real, still-open content gap: Brintoncare's 4th block is a genuine, factual claim ("Present in 32 countries") BRENTIS cannot honestly replicate (no international presence) — correctly replaced with "Why Choose BRENTIS" instead, which is the right call, not a shortfall.

## D. Categories

| Metric | Brintoncare | BRENTIS |
|---|---|---|
| Card count | 4 (brand sub-lines: **UV Doux, Wellgrow, Dexperts, Obril** — not generic medical categories) | 8 (real catalog categories: Pain Relief & Fever, Vitamins & Supplements, Diabetes Care, Digestive Health, Allergy & Cold, Personal Care, Wellness & Heart Health, Baby & Mother Care) |
| Treatment | Full-bleed photography, white pill label at bottom | Full-bleed photography, white pill label at bottom (already matches) |
| Grid | 4 columns @1440/1280/768; 2 columns @390 | 4 columns @1440/1280; 2 columns @768/390 |

**Note on category count:** Brintoncare's 4 cards are literally its 4 product sub-brands, not a general taxonomy — BRENTIS's 8 real catalog categories are not directly comparable 1:1, and 8 is the correct, honest number for this catalog (not something to artificially shrink to "look like Brintoncare").

## E. Values / Differentiation — editorial section

**Brintoncare "What differentiates us from the competition?"** (confirmed fresh via full-page screenshot at 1280px):
- 2-column: left = heading + 1 paragraph + a **5-item value list** in a 2-column sub-grid (Collaboration and Teamwork · Trust and Integrity · Mutual Respect · Leadership with Empathy · Ownership and Empowerment, each with a small colored icon), right = **1 large portrait photo** (person applying skincare), no collage — confirmed distinct from the About section's single-photo-with-accents treatment.
- Stacks to photo-above-text on tablet/mobile, list stays 2-column.

**BRENTIS "A Brand Built Around Care."** (`WhyBrentisSection`):
- Same editorial shape: heading + paragraph + **4-item list** (Verified Sourcing · Secure Checkout · Tracked Delivery · Prescription-Aware) in a 2-column sub-grid on the left, **1 large photo** (doctor consulting a patient) on the right.

**Verdict:** already matches the reference's editorial intent (text+list+photo, not a generic card grid) — this was the other major structural gap identified before implementation and it's already closed.

## F. Section background rhythm — the real, measured cause of "feels monotone"

This is the single most concrete, previously-unmeasured root cause found in this audit.

**Brintoncare alternates a real background color every 1–2 sections** down the page: cream hero → white about → pale-green categories → white differentiation → pale-yellow marquee strip → white bestsellers → pale-yellow press-acknowledgment strip → white blog → green footer. Each transition is a real, confirmed `background-color` change on a `<section>`-level element.

**BRENTIS, measured section-by-section on the real homepage (`main > div > section`, 9 sections, light mode):**

| Section | `background-color` |
|---|---|
| Hero | `rgb(23,43,47)` — dark navy (deliberate) |
| About ("Care Beyond Products") | `rgba(0,0,0,0)` — **transparent, shows raw page bg** |
| Categories ("Explore Healthcare Essentials") | `rgba(0,0,0,0)` — **transparent** |
| Values ("The Values Behind Our Care") | `rgb(255,240,232)` = `#FFF0E8` (the documented Section-bg token — correctly used) |
| Products ("A Few Essentials Worth Exploring") | `rgba(0,0,0,0)` — **transparent** |
| Knowledge ("Knowledge Is Part of Good Care") | `rgba(0,0,0,0)` — **transparent** |
| Why BRENTIS ("A Brand Built Around Care") | `rgba(0,0,0,0)` — **transparent** |
| Customer Trust ("Built on Transparent Practice") | `rgb(255,255,255)` white (Card-bg token — correct) |
| Newsletter ("Stay Updated") | `rgb(255,255,255)` white |

**5 of 9 sections render with no section-level background at all** — they simply show the page's own cream (`#FFF7F2`) underneath, with zero color banding between them. Only Hero, Values, Trust, and Newsletter use an explicit background. This is a real, measured, mechanical explanation for "the page feels flat/monotone scrolling down it" that doesn't require guessing — it's a direct, fixable CSS fact: alternate `bg-main` and the already-defined `bg-section` (`#FFF0E8`)/`bg-card` (white) tokens across consecutive sections, the same way Brintoncare alternates white/pale-green/pale-yellow, using tokens that already exist in the BRENTIS palette (no new colors needed).

## G. Best-selling products — highest priority, re-measured

| Metric | Brintoncare (measured) | BRENTIS (measured) |
|---|---|---|
| Card size | **278×486px** | **325×468px** |
| Image area | 278×278px (1:1 square) | 275×275px (1:1 square) — essentially identical ratio |
| Image natural size (as served) | 1440×1440px (served far larger than displayed — a real bandwidth inefficiency on Brintoncare's side, not something to copy) | Unsplash-sourced, `w=800` request param — appropriately sized |
| Card border-radius (outer container) | `0px` (rounding lives on an inner image wrapper, not the card itself) | `0px` on the card; image/card visual rounding via Tailwind utility classes on inner elements |
| Button height | 44px ("View Options" — single button) | 34px ("Add to cart" + "Buy now" — **two buttons**, a real functional difference, not just styling) |
| Columns @1440 | 4 | 4 |
| Grid gap | *(not independently isolated this session)* | 20px |
| Cards shown | 4 visible, tabbed by category (Sun Care/Anti-Ageing/Emollients/Skin Brightening/Hair Care), "View All" link, prev/next carousel arrows | 4 visible, single row, no tabs, "View all" link, no carousel arrows (desktop: static 4-col grid; mobile: horizontal scroll-snap) |

**Root cause of any size difference:** BRENTIS cards are **17% wider** (325 vs 278px) but **4% shorter** (468 vs 486px) than Brintoncare's — this is a real, measured, modest difference, not the dramatic "oversized" gap a casual visual impression might suggest. The actual compactness driver on Brintoncare's side is the **single-button, 44px CTA** vs. BRENTIS's **two-button row** — two side-by-side buttons at comparable total width necessarily look busier per card even at a similar card footprint. If a more compact feel is wanted, the lever is button treatment (e.g., one primary CTA with a secondary action moved to the PDP, or a smaller icon-only secondary button) — not blindly shrinking the whole card.

## H. Recognition, blogs, social, footer

- **"Acknowledged by" press strip (confirmed, 5 logos, not 4 as an earlier pass recorded):** Forbes, Men's Health, GQ, Rolling Stone, **People** — all real SVG logo assets served from Brintoncare's own CDN. **No BRENTIS equivalent exists and none should be fabricated** — no genuine press coverage exists for BRENTIS.
- **Store-availability marquee** ("AVAILABLE AT ALL LEADING STORES"): real, pure-text marquee strip on Brintoncare, pale-yellow background. **No BRENTIS equivalent — correct, since no real store partnerships exist.**
- **Blog cards:** Brintoncare uses a horizontal carousel with prev/next arrows over real post photography; BRENTIS uses a static 3-card grid over real seeded post content (no images on the current 5 posts' blog data — see [`BRENTIS_REFINEMENT_IMPLEMENTATION_PLAN.md`](./BRENTIS_REFINEMENT_IMPLEMENTATION_PLAN.md) §Blog for the real, genuine articles available to source cover photography for, once chosen).
- **Social section:** Brintoncare has a real, live "We are shaped by our social environment" section with 2 embedded Instagram posts (`instagram-feed` WP plugin). BRENTIS has no equivalent — correctly absent, since no Instagram Graph API integration or manual curation pipeline exists yet.
- **Footer:** Brintoncare: green background, wavy SVG top border, real payment icons (Visa/Maestro/Mastercard/RuPay), real accreditation badges (Dermatologically Tested, FDA-Approved — **not transferable, no equivalent certification exists for BRENTIS**), newsletter signup, real contact details (`hello@brintonhealth.com`, `+91 9168099990`). BRENTIS footer: dark background (no wave), real payment-method labels already added (Visa/Mastercard/RuPay/UPI/Netbanking/Wallets, text-based rather than reproduced trademark logos — a deliberate, already-made decision, see the prior implementation's reasoning), no accreditation badges (correct — none are real), real newsletter signup.

## I. Real console/network findings (both sites)

- **Brintoncare: ~30 console errors during a single homepage load** — the large majority are `403`/`ERR_ABORTED` on Google Ads conversion-tracking beacons (`googleadservices.com`) and GA4 collection endpoints, consistent with this automated browser context lacking real user consent/cookies rather than a site defect. **Two genuinely reproducible 404s** confirmed by direct network-log inspection: `wp-content/plugins/wac-addon/.../images/home/img-ele-before.svg` and `...img-ele-after.svg`, each requested 4 separate times during one page load, every time failing — a real, minor asset-reference bug on Brintoncare's own site (not something to replicate).
- **BRENTIS: zero console errors** on the same homepage load, confirmed via `read_console_messages({onlyErrors:true})`.

## J. Previously-unconfirmed/corrected findings from this session

1. About section photo is **1 single photograph**, not a 2-image collage (corrected above, §C).
2. "Acknowledged by" strip has **5** press logos, not 4 (corrected above, §H) — People magazine was previously missed.
3. Brintoncare's search bar is **not a real input at rest** — a detail worth knowing but explicitly **not** a pattern to copy (BRENTIS's always-functional search is better UX).
4. Brintoncare serves its bestseller product images at **1440×1440px natural** but displays them at 278×278px — a real inefficiency, explicitly **not** a pattern to copy.
5. BRENTIS's own dark-mode toggle state can silently make a tester believe the whole brand is "dark and monotone" when the real new-visitor default is light — this was caught and corrected mid-audit (see the top of this document) and is worth remembering for any future QA pass: **always confirm `localStorage.getItem('mc_theme')` before drawing conclusions from a screenshot.**
