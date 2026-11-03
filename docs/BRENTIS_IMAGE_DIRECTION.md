# BRENTIS HEALTHCARE — About Us Content & Image Direction

**Status:** Research only — no code changed. Sourced from `/Users/ankan/Desktop/medweb/aboutus.txt` (read in full) and the live, measured Brintoncare About section in [`BRENTIS_VISUAL_AUDIT.md`](./BRENTIS_VISUAL_AUDIT.md) §C.

---

## 1. Verified company information extracted from `aboutus.txt`

**Major finding — this closes a previously-documented content gap.** Earlier work in this project repeatedly flagged "a real, business-authored Vision & Mission sentence" as a missing content dependency and deliberately left a "coming soon" placeholder in the About section's Vision & Mission block rather than inventing one. **That real statement now exists** and should be the first thing Prompt 2 of this workflow wires in:

> **Vision:** *"To build a trusted and progressive healthcare and wellness company that improves everyday lives through quality, innovation, and responsible care."*
>
> *"We envision Brentis Healthcare growing into a widely trusted organisation that makes healthcare and wellness solutions more accessible across India and, eventually, global markets."*

**Mission** (8 concrete commitments, usable verbatim as a list or distilled into the "Our Core Values"/"Why Choose BRENTIS" blocks):
- Quality-driven healthcare and wellness solutions
- Consumer needs and well-being at the center of decisions
- Innovation and continuous improvement
- Strong standards of quality, safety, transparency, and responsibility
- A reliable network of customers, pharmacies, distributors, and business partners
- Accessible, convenient, and value-driven solutions
- Long-term relationships based on trust, integrity, and consistent service
- Sustainable growth with responsibility toward people, society, and the environment

**8 named commitments** (each with its own short description in the source doc — a ready-made structure for a future expanded "Our Commitments" section, not a forced fit into the existing 4-block layout): Quality First · Minds That Care · Responsible Innovation · Customer Centricity · Transparency & Integrity · Reliable Partnerships · Continuous Improvement · Building for Tomorrow.

**Real contact details:**
- Support email: `care@brentishealthcare.com`
- Support hours: Monday–Saturday, 9:00 AM–6:00 PM IST (**already matches** what's used elsewhere in this project)
- Bulk/distributor enquiries routed through the existing Bulk Purchase / Distributor Enquiry section (already built)

**Important discrepancy to flag, not silently resolve:** `aboutus.txt` consistently writes the tagline as **"MINDS THAT CARE"** (plural "Minds"), used 3 separate times in the document. Every other source in this project — the original brief, the codebase's own copy, prior documentation — uses **"Mind That Cares"** (singular "Mind"). This is a real conflict between two authoritative-seeming sources, not a typo to silently pick a side on. **Flag to the business owner for a definitive answer before changing any live copy** — do not change the tagline based on this document alone.

**Separate discrepancy, same treatment:** `WEBSITE DOCUMENTATION.docx`'s policies consistently use the support email `care@Brentislabs.com` / `customercare@Brentislabs.com` (domain **Brentislabs.com**), while `aboutus.txt` uses `care@brentishealthcare.com` (domain **brentishealthcare.com**). Both read as genuine, deliberately-written addresses, not placeholders — **do not silently pick one**; this needs the business owner's confirmation on which domain is the live one before any contact-info copy changes.

**Also newly confirmed from the same documents (not previously known to this project):**
- Legal entity name: **Brentis Healthcare Pvt. Ltd.**, registered office in Budge Budge, Kolkata, West Bengal — India-only operations currently, international shipping "may be introduced in the future."
- Product scope explicitly includes **pet care** ("individuals, families, and pets" — `aboutus.txt`; "healthcare, wellness, nutrition, personal care, hygiene, and pet care products" — `WEBSITE DOCUMENTATION.docx`), not reflected anywhere in the current catalog or category set.
- **"BRENTIS" is described as a wellness sub-brand owned by Brentis Healthcare** ("BRENTIS, a wellness brand owned by Brentis Healthcare" — `BLOGS.docx`, used 5 times). The current codebase treats "BRENTIS HEALTHCARE" as a single flat brand name throughout. This is a brand-architecture nuance worth the business owner's confirmation, not something to restructure unilaterally.
- A **"Brentis Wallet"** cashback/loyalty feature is explicitly documented as **not yet launched** ("Future Feature") — relevant if any future homepage copy is tempted to reference wallet/cashback, since none of that exists today.

## 2. Current image asset audit (what exists today, what each one is actually for)

All current storefront imagery is either (a) real seeded product photography with branding/text baked into the pixels (demo/placeholder assets, see this project's prior root-cause work on the former "white circle" product-image bug) or (b) individually-verified, unbranded Unsplash stock photography sourced in the immediately preceding implementation work. None of it is BRENTIS's own brand/product photography, because none exists yet.

| Current image | Current component | Why it's weak |
|---|---|---|
| Vitamins/wellness flatlay (Unsplash) | About section's single photo | Generic stock, not BRENTIS-specific — honest placeholder, not a defect, but replaceable the moment real product photography exists |
| 8 category stock photos (blister packs, capsules, clinical checkup, food bowl, spa facial, fitness class, baby) | Category cards | Same — real, unbranded, individually vetted, but generic rather than BRENTIS's own packaging/products |
| 14 demo product images (medicine/capsule/personal-care stock, swapped in from a prior placeholder-graphic bug) | PLP/PDP/homepage product cards | Demo catalog only — Paracetamol/Ibuprofen/Metformin etc. are *demo SKUs*, not real BRENTIS products (see §3) |
| Doctor-consulting-patient photo (Unsplash) | Differentiation/"Why BRENTIS" section | Generic stock, same caveat as above |
| 3 hero slide photos (Unsplash: clinical checkup, blister packs, capsules) | Hero carousel | Same caveat |

## 3. The real catalog mismatch — the most important finding in this document

**The current demo catalog and the real BRENTIS product line described in the business documents are two completely different sets of products.** This has direct implications for which images are even worth sourcing.

- **Current seeded demo catalog** (`migrate-demo-content.ts`, explicitly labeled demo content): Paracetamol, Ibuprofen, Daily Multivitamin, Vitamin C tablets, Metformin, Glimepiride, Antacid Suspension, Probiotic capsules, Cetirizine, Cold & Cough Syrup, Hand Sanitizer, Face Cleanser, Baby Lotion, Omega-3 — a general OTC/prescription pharmacy assortment.
- **Real BRENTIS product line, per `BLOGS.docx`'s five complete, genuine articles** (each with SEO title, meta description, URL slug, full body copy, FAQ, and medical/regulatory disclaimer already written): **ACV Effervescent Tablets, Vitamin C + Zinc Effervescent Tablets, Glutathione + Vitamin C Effervescent Tablets, Sea Buckthorn Juice, Shilajit Resin** — a wellness/nutraceutical-supplement line, not a general pharmacy.

**Recommendation, not an instruction to act on unilaterally:** flag this mismatch to the business owner before any further catalog or photography work. If the 5 real BRENTIS products above are the actual launch catalog, the demo pharmacy SKUs (and their stock photography) are placeholder scaffolding that should eventually be replaced by the real 5-product line — at which point real product photography (actual bottles/jars/resin packaging) becomes both necessary and feasible to source or commission, rather than continuing to substitute generic stock photography indefinitely.

## 4. Image replacement inventory — proposed direction (not implemented)

| Current image | Current component | Why it's weak | Proposed subject | Composition | Aspect ratio | Lighting | Placement |
|---|---|---|---|---|---|---|---|
| Vitamins flatlay (stock) | About section | Generic, not BRENTIS-specific | **If the 5-product pivot (§3) is confirmed:** a real photograph of the actual ACV/Vitamin C+Zinc/Glutathione effervescent tablet tubes or Shilajit resin jar, styled simply (matches Brintoncare's own clean product-on-seamless-background approach). **Until then:** keep the current honest stock substitute — do not fabricate BRENTIS-branded packaging that doesn't exist. | Single hero product shot, generous negative space, portrait ~0.83 ratio (matches the measured Brintoncare reference) | Soft, even, slightly warm | About section, left column |
| 8 category stock photos | Category cards | Generic, not catalog-specific | Real photography of each category's actual best-selling product once the catalog direction (demo pharmacy vs. 5-product wellness line, §3) is settled | Full-bleed, product-forward, consistent background treatment across all 8 for visual rhythm | 283:395 (matches measured Brintoncare category-card ratio) | Consistent studio lighting across the set | Category grid |
| Doctor-consulting photo (stock) | Differentiation section | Generic, not BRENTIS-specific | A real photo of product-in-use (e.g., someone taking the effervescent tablet, or a wellness-routine moment) rather than a clinical-consultation scene that implies a medical-professional endorsement BRENTIS hasn't made | Portrait, person-centered, warm/approachable (not clinical) | ~0.83 portrait | Warm, natural light | Differentiation section, right column |
| 3 hero photos (stock) | Hero carousel | Generic | Real lifestyle/product photography once available; until then the current text-free stock photos are a reasonable, honest placeholder — **do not revert to the old baked-in-text seeded banners**, which caused a real, already-fixed duplication bug | Full-bleed landscape, text-safe zone on the left third | ~3:1 landscape | Bright, optimistic | Hero |

**What this document explicitly does not do:** invent product packaging, fabricate a photoshoot that hasn't happened, or claim any of the above images exist. This is a direction for Prompt 2 (or a future, separate photography/sourcing effort) to execute against once the business owner confirms the catalog direction in §3.
