# Brintoncare.com — Reverse-Engineered UI/UX Specification

**Status:** Research only. Every measurement below was taken from the **actual rendered page** at `https://brintoncare.com/` via live browser automation (viewport resize + `getBoundingClientRect()`/`getComputedStyle()` + direct screenshots), not from HTML source, search snippets, or guesswork. Where a precise figure could not be reliably obtained (noted explicitly), that limitation is stated rather than invented.

**REA status:** Verified not installed (`which rea` → not found, no `rea-agents` package anywhere on this machine, no reference in Claude config). This matches the documented decision from this project's very first prompt: REA's installer makes a global, unsandboxed config change affecting every future Claude Code project, and a confirmed imposter/trojan package has circulated under its name — that risk assessment hasn't changed, so it remains uninstalled. The in-app Browser tool (used for every measurement below) already satisfies the actual requirement ("inspect websites and interact with browser pages") and has been used successfully throughout this entire project.

---

## A. Header

| Property | Measured value |
|---|---|
| Height | **79.2px** |
| Width | Full viewport (1440px at desktop) |
| Position | `fixed` (sticky at all times, not scroll-triggered) |
| Background | `rgb(255,255,255)` — solid white |
| Border | None detected (`border-bottom: 0px none`) |
| Logo | SVG (`brinton-logo.svg`), **117.9 × 39.0px**, positioned at x=133, y=11 |
| Nav | Starts at x=271, width ≈424px, horizontal, left-aligned next to logo (not centered) |
| Nav labels | ALL PRODUCTS · ABOUT US · BLOGS · R&D (4 items, all-caps styling) |
| Search | Pill-shaped input + circular teal submit button, right-of-center |
| Account/Cart | Simple line icons, far right, cart shows item-count badge |
| Mobile (390px) | Logo + search icon + cart icon + hamburger (3-line) icon — nav labels collapse entirely into the hamburger menu, no visible text labels at this width |

**BRENTIS recommendation:** Current `Header.tsx` (sticky, `bg-ink`, logo+wordmark, search, account, cart, hamburger) already matches this structural pattern closely (built in Prompt 3 of the prior workflow). No major restructure needed — see comparison doc for the specific deltas (header background is colored ink vs. Brintoncare's white, which is a deliberate, acceptable brand difference, not a defect).

---

## B. Hero

| Property | Measured value |
|---|---|
| Section width × height | **1440 × 472.5px** (desktop), full-bleed |
| Image | `object-fit: cover`, fills the entire section |
| Heading | `<h2>`, **57px**, `font-weight: 600`, black text, left-aligned, positioned over the image (not beside it) |
| CTA button | Pill shape, **123 × 36px**, positioned below heading/subcopy |
| Pagination | **6 dot indicators**, bottom-center, `button[aria-label="Go to slide N"]` |
| Slide count | 6 (confirmed via 6 pagination buttons) |
| Manual navigation | **Confirmed working** — clicked "Go to slide 2," heading/image/subcopy/CTA all changed together in one screenshot-verified transition |
| Autoplay interval | **Could not be reliably measured.** Observed the same slide persist for 36+ seconds without auto-advancing in this automated browser session. This is most likely due to background/automated-tab timer throttling (a well-known browser behavior for carousels driven by `setInterval`/`requestAnimationFrame` in non-foregrounded tabs), not necessarily evidence that autoplay is disabled — but it cannot be stated as fact either way without a human directly watching a foregrounded tab. **Documented as an open/unverifiable data point rather than guessed.** |
| Transition style | Content (image+text) changes as a unit on slide change — consistent with a crossfade or instant swap; could not conclusively distinguish fade vs. slide-translate from static screenshots alone |
| Prev/Next arrows | Not found in the accessible-interactive-elements tree at the time of inspection (only the 6 dot buttons were exposed); may be hover-reveal-only and not captured by this method — **not confirmed either way with certainty** |
| Mobile (390px) | Same flat-background product-pedestal composition, trust badge overlay ("No.1 Dermatologist Recommended..."), single CTA, 6 dots — composition is preserved, not redesigned for mobile |

**Honesty note:** every number above that could be measured, was. The two items marked "could not be reliably measured" are reported as such rather than filled in with a plausible-sounding guess.

**BRENTIS recommendation:** The current static `Hero` (built in the prior workflow's Prompt 6, specifically to eliminate a real, confirmed text-duplication bug caused by seeded banner images with text baked into the pixels) should evolve toward Brintoncare's proven pattern **once real, text-free photography exists for multiple real promotions** — a carousel is appropriate when there's real rotating content to show, not before. See the implementation plan doc for the exact staged recommendation.

---

## C. About Us — the five-unit layout (critical requirement, precisely measured)

Confirmed structure: **one large image composition (itself a two-photo overlapping collage) + four information blocks**, exactly as described in the prompt.

| Element | Measured value |
|---|---|
| Section eyebrow | "ABOUT US" — small, teal, letter-spaced |
| Section heading | "Unique Formulations to Ensure Holistic Wellness" + a hand-drawn green squiggle underline accent |
| Main image | **409.5 × 492.2px**, portrait orientation, rounded corners, `dtan-img.webp` |
| Overlapping second image | Smaller, circular/rounded-square crop (a face close-up), offset bottom-right over the main image — creates the "one large image **composition**" effect through overlap rather than a single flat rectangle |
| Decorative accents | 2 small hand-drawn SVG accents (a sparkle/cross mark near the image, a looping arrow pointing toward it) |
| Four info blocks | 2×2 grid, each with: a small circular icon (diamond/leaf, concentric-circle, badge, heart), a bold heading, a 1–2 sentence description, a thin underline divider |
| Block 1 | **Core Values** — "Embracing trust, respect, collaboration and empowerment" |
| Block 2 | **Vision & Mission** — "To be a Global leader, providing high-quality & affordable healthcare solutions to meet unmet needs." |
| Block 3 | **International Presence** — "Present in 32 countries and still expanding" |
| Block 4 | **Why us?** — "We aspire to improve people's lives through qualitative yet affordable solutions." |
| Responsive (390px) | Image collage moves above the 4 blocks (stacked, full-width); blocks arrange in what appears to be a 2-column grid rather than a single column |

**BRENTIS adaptation (per the explicit instruction not to fabricate credentials):**

| Reference block | BRENTIS equivalent | Can we claim it truthfully today? |
|---|---|---|
| Core Values | **Our Core Values** | Yes — "Quality & Trust," "Customer-First Thinking" etc. already drafted and in use (prior workflow's homepage About copy) |
| Vision & Mission | **Our Vision & Mission** | Partially — a vision statement is a legitimate aspirational claim a business can state about itself without evidence (it's a stated intention, not a credential); must be phrased as *our* aspiration, not an achieved fact |
| International Presence | **Our Commitment to Care** (replacement, not a direct swap) | **No** — "present in 32 countries" is a specific, falsifiable operational claim with zero supporting evidence for BRENTIS (confirmed: this project's only real NAP/operational data is placeholder, per the prior workflow's SEO audit). Replacing the concept entirely (not just the label) rather than inventing a number. |
| Why us? | **Why Choose BRENTIS** | Yes — verified sourcing/secure checkout/GST invoicing facts already established and reused in this project |

**Content gap to flag to the business owner:** a real "Vision & Mission" statement (one sentence of genuine aspiration, business-authored) is needed — this project should not write a vision statement on the business's behalf.

---

## D. Categories

| Property | Measured value |
|---|---|
| Section background | Light sage/cream (`#F5F4EE`-ish), distinct from the white About section above it |
| Heading | "CATEGORIES" eyebrow + "Browse Through Our Product Categories" with the same green squiggle accent |
| Card count | 4 |
| Card dimensions | **283 × 395px** (portrait, ~0.72:1 ratio) |
| Border radius | **20px** |
| Content | Real product-line photography fills the card edge-to-edge (`object-fit`-style full-bleed), not an icon |
| Label | White pill button overlaid at the bottom of each card (e.g. "UV Doux," "Wellgrow," "Dexperts," "Obril") |

**Critical distinction confirmed:** these are **product-line/sub-brand** categories (Brintoncare's own house brands), not generic medical categories like BRENTIS's real 8 categories (Pain Relief & Fever, Vitamins & Supplements, etc.) — the *visual pattern* (large photographic card + pill label) is what should transfer, not the specific category taxonomy, since BRENTIS's real catalog structure is genuinely different.

**BRENTIS blocker:** no category photography exists in the real BRENTIS catalog data (confirmed: `Category.imageUrl` is unset on every seeded category, per the prior workflow's investigation). This card pattern cannot be fully realized until real category photography exists — see the comparison and implementation-plan docs.

---

## E. Differentiation / "What differentiates us from the competition?"

| Property | Measured value |
|---|---|
| Layout | Two-column editorial: text+list on the left, one large portrait photo on the right (woman applying skincare product) |
| Eyebrow | "OUR VALUES" |
| Heading | "What differentiates us from the competition?" + squiggle accent |
| Body copy | One paragraph (~2 sentences) before the list |
| Value list | 5 items, each with a small icon + short label, in a 2-column sub-grid: Collaboration and Teamwork, Trust and Integrity, Mutual Respect, Leadership with Empathy, Ownership and Empowerment |
| Image | Large portrait photo with decorative sparkle-line accents, no overlap/collage this time (unlike the About section) |

**This is structurally distinct from the About section** (different image treatment, a 5-item list instead of 4 blocks, different heading pattern) — confirms Brintoncare deliberately uses **two separate editorial moments**, not one section reused twice. BRENTIS's equivalent "Why BRENTIS" section (built in the prior workflow) is currently a 4-card icon grid, not an editorial image+list layout — flagged in the comparison doc as a real structural gap.

---

## F. Availability / Recognition Strip

Two distinct strips were found, not one:
1. **"AVAILABLE AT ALL LEADING STORES"** — a continuous horizontal marquee of **repeated text only** (teal background, cream text) — no retailer logos were visible in what rendered during this inspection pass.
2. **"Acknowledged by"** — a separate strip (cream background) with real **publication logos: Forbes, Men's Health, GQ, Rolling Stone**.

**BRENTIS recommendation — do not replicate either:** No evidence exists anywhere in this project of real retail-store distribution or real press/publication recognition for BRENTIS. Per the explicit instruction not to invent store partnerships or publication recognition, **both of these sections should be omitted entirely** for BRENTIS rather than adapted with placeholder logos. If the business later has genuine press mentions or retail partners, this is the pattern to revisit.

---

## G. Product Carousel ("Our Bestsellers")

| Property | Measured value |
|---|---|
| Eyebrow | "OUR BESTSELLERS" |
| Heading | "Explore Our Exclusive Best-Selling Products" |
| Category tabs | Sun Care · Anti-Ageing · Emollients · Skin Brightening · Hair Care (5 tabs, click-to-swap grid content) |
| Card content | Rating badge (star + number) overlay, product image, name, price range, "View Options" pill button (green) |
| Grid | 4 columns at 1440px (confirmed via earlier screenshot measurement work) |
| "View All" | Present below the grid, links to the full shop |

**BRENTIS requirement (unchanged from the prior workflow, re-confirmed as correct here):** exactly **one** product-merchandising section, ~4 products, one row desktop / horizontal scroll mobile. The already-implemented `SelectedProductsSection` on the current BRENTIS homepage already matches this pattern structurally — see comparison doc for the remaining visual deltas (card styling, no category tabs currently).

---

## H. Recognition / Trust

Covered under §F above (the Forbes/Men's Health/GQ/Rolling Stone strip is the recognition section). No separate testimonial-style press-quote section was found beyond the customer testimonials already documented in the prior workflow's research (name, city, photo, quote — 6 testimonials, not press-based).

---

## I. Blog / Educational Content

| Property | Measured value |
|---|---|
| Eyebrow | "BLOGS" |
| Heading | "Discover a wealth of knowledge in our insightful blogs" |
| Card layout | 3-across visible, horizontal carousel (prev/next arrow buttons confirmed present on either side) |
| Card content | Real photography, category tag (e.g. "Skin Brightning"), title, no visible excerpt in the carousel cards themselves (excerpt appears on the full blog list page instead, per earlier research) |
| "View All Blogs" | Present below the carousel |

**BRENTIS:** the current `KnowledgeSection` (3-column static grid, real seeded blog posts, category tag + title + excerpt + date + "Read article →") already captures the editorial intent closely. The one structural delta: Brintoncare's version is an interactive carousel with more than 3 posts available; BRENTIS's is a static 3-card grid. Given BRENTIS only has 5 real seeded blog posts total, a carousel isn't yet necessary — noted as a future enhancement once more real content exists, not a current defect.

---

## J. Social Section

"We are shaped by our social environment." heading + Instagram post grid (image thumbnails linking to real `instagram.com/p/...` URLs, confirmed real in the prior workflow's Footer research — Brintoncare's own real account, not applicable to copy for BRENTIS). **BRENTIS has no equivalent section today** and has real, verified social URLs already in `Footer.tsx` (Instagram, YouTube, LinkedIn, X, Facebook) — but no live Instagram *post* embed exists in this project (would require either a real Instagram Graph API integration or manually curated post links, neither of which exists today). Flagged as a content/integration gap, not fabricated.

---

## K. Footer

| Property | Measured value |
|---|---|
| Background | Solid green (`#6fae6c`-ish — a brand-specific color, not reusable for BRENTIS) |
| Top edge | **Decorative wavy/curved SVG border** — a signature visual treatment, not a straight edge |
| Columns | Menu · (2 sub-columns of category links) · Policies · Contact (email/phone/social) |
| Newsletter | "For out latest offers and promotions!" + email input + Subscribe button |
| Accreditation badges | "Dermatologically Tested," FDA-style badge — **real claims for Brinton specifically, not verifiable or transferable to BRENTIS** |
| Payment icons | Visa, Mastercard, RuPay, UPI, bank, device icons |
| Copyright | "© 2026 Brinton Pharmaceuticals Ltd. All Rights Reserved." |

**BRENTIS recommendation:** the current `Footer.tsx` (dark `bg-ink`, 4-column: brand/Quick Links/Policies/Newsletter, real social links, no payment icons currently shown) captures the structural pattern (columns + newsletter + policies) but is missing: a payment-method icon row (Razorpay supports card/UPI/netbanking/wallets — these icons are reasonable to add, they describe real accepted payment methods, not a fabricated claim) and does not use a wave-shaped top border (a pure decorative choice, optional, not required for functional parity). **Do not add "Dermatologically Tested"/FDA-style badges** — no such accreditation exists for BRENTIS.

---

## Responsive Summary (measured, not assumed)

| Breakpoint | Nav | Hero | About | Categories |
|---|---|---|---|---|
| 1440/1280px | Full horizontal nav, inline search | Full-bleed 2-col-equivalent (text overlaid on image) | Image+4-blocks side-by-side (image left, blocks right 2×2) | 4-across |
| 768px | Not directly re-measured this pass (prior workflow's Prompt 4 research covered this: hamburger nav begins at/before 768px) | Same composition, full width | Not re-measured this pass | Not re-measured this pass |
| 390px | Hamburger + icon-only header | Same composition, shorter height, dots remain | Image collage stacks above the 4 blocks (2-col sub-grid) | Not re-measured this pass (prior research: cards likely stack to fewer columns) |

---

*Companion documents: [`BRENTIS_REFERENCE_VS_CURRENT_COMPARISON.md`](./BRENTIS_REFERENCE_VS_CURRENT_COMPARISON.md), [`BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md`](./BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md).*
