import { ROLES } from '@medcommerce/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/models/user.model';
import { BrandModel } from '../modules/catalog/models/brand.model';
import { CategoryModel } from '../modules/catalog/models/category.model';
import { ManufacturerModel } from '../modules/catalog/models/manufacturer.model';
import { ProductModel } from '../modules/catalog/models/product.model';
import type { AboutContentInput } from '../modules/cms/about-content.validator';
import { BannerModel } from '../modules/cms/models/banner.model';
import { BlogModel } from '../modules/cms/models/blog.model';
import { HomeSectionModel } from '../modules/cms/models/home-section.model';
import { PageModel } from '../modules/cms/models/page.model';
import { BatchModel } from '../modules/inventory/models/batch.model';
import { WarehouseModel } from '../modules/inventory/models/warehouse.model';
import { setConfiguration, getConfiguration } from '../modules/platform/configuration.service';
import { SellerModel } from '../modules/sellers/models/seller.model';

import { GENERATED_PAGES } from './content/policy-pages.generated';

/**
 * Idempotent content migration — carries the professionally-named catalog/
 * CMS demo content created during the local Docker/MinIO audit into whatever
 * database this script is run against (local, or production Atlas via the
 * API container's own already-configured MONGO_URI — this script never reads
 * or accepts a connection string directly).
 *
 * Every record is matched against the target database by a stable business
 * key (slug/SKU/GSTIN/code/title) before writing. A match is REUSED as-is
 * (its existing fields are never overwritten) so this can never clobber
 * something an admin has since edited in production; only a true miss
 * inserts a new record. Safe to run more than once — the second run should
 * report every record as "reused".
 */

const SELLER = {
  legalName: 'KarienLabs Retail Pvt. Ltd.',
  gstin: '27AAAAA0000A1Z5',
  drugLicenseNumber: 'MH-PUN-20260001',
  address: 'Plot 14, Industrial Area, Pune, Maharashtra 411019',
};

const WAREHOUSE = {
  name: 'Main Distribution Center',
  code: 'MDC-01',
  address: 'Plot 14, Industrial Area',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411019',
};

const CATEGORIES = [
  { name: 'Pain Relief & Fever', slug: 'pain-relief-fever' },
  { name: 'Vitamins & Supplements', slug: 'vitamins-supplements' },
  { name: 'Diabetes Care', slug: 'diabetes-care' },
  { name: 'Digestive Health', slug: 'digestive-health' },
  { name: 'Allergy & Cold', slug: 'allergy-cold' },
  { name: 'Personal Care', slug: 'personal-care' },
  { name: 'Wellness & Heart Health', slug: 'wellness-heart-health' },
  { name: 'Baby & Mother Care', slug: 'baby-mother-care' },
];

/**
 * Prompt 3 — Dynamic CMS. These are the SAME images that were previously
 * hardcoded directly into HomePage.tsx's `CATEGORY_PHOTOS` object (each
 * individually opened/verified stock photography, never a third-party
 * product/brand shot) — this migration only RELOCATES them onto the actual
 * Category documents (`imageUrl`/`imageAlt`) so the storefront reads them
 * from the database/admin instead of a hardcoded frontend constant. Never
 * overwrites a category whose `imageUrl` an admin has since set (see the
 * `if (!doc.imageUrl)` guard below) — idempotent and non-destructive.
 * `imagePublicId` is intentionally left `null` (these are external URLs,
 * not Cloudinary-managed assets) until an admin replaces them through the
 * Cloudinary upload widget in the Categories admin form.
 */
const CATEGORY_IMAGES: Record<string, { url: string; alt: string }> = {
  'pain-relief-fever': {
    url: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=700&q=80',
    alt: 'Tablets and capsules in sealed blister packaging',
  },
  'vitamins-supplements': {
    url: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=700&q=80',
    alt: 'Vitamins and everyday wellness essentials arranged together',
  },
  'diabetes-care': {
    url: 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=700&q=80',
    alt: 'Healthcare professional reviewing a patient’s vitals during a checkup',
  },
  'digestive-health': {
    url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=700&q=80',
    alt: 'A balanced plate of fresh, whole foods',
  },
  'allergy-cold': {
    url: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=700&q=80',
    alt: 'Capsules spilling from an open medicine bottle',
  },
  'personal-care': {
    url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80',
    alt: 'A relaxing personal-care skincare treatment',
  },
  'wellness-heart-health': {
    url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=700&q=80',
    alt: 'People exercising together in a fitness class',
  },
  'baby-mother-care': {
    url: 'https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=700&q=80',
    alt: 'A baby exploring a wooden toy',
  },
};

/**
 * Homepage "About Us" teaser content — the real copy that used to live in
 * HomePage.tsx's `ABOUT_BLOCKS`/`WHY_BRENTIS` constants, plus the real
 * Vision statement from aboutus.txt. Relocated into the 'about' Configuration
 * namespace so it's admin-editable (see about-content.service.ts); never
 * fabricated, never overwritten if an admin has already saved content here
 * (see the `isEmpty` guard in seedAboutContent()).
 */
const ABOUT_CONTENT_SEED: AboutContentInput = {
  tagline: 'About BRENTIS HEALTHCARE',
  heading: 'Care Beyond Products.',
  description:
    'BRENTIS HEALTHCARE exists to make everyday healthcare simpler and more dependable — that’s what “Minds That Care” means to us.',
  mainImageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=1400&q=80',
  mainImagePublicId: null,
  mainImageAlt: 'Vitamins and everyday wellness essentials arranged together',
  secondaryImageUrl: '',
  secondaryImagePublicId: null,
  secondaryImageAlt: '',
  blocks: [
    {
      iconKey: 'values',
      title: 'Our Core Values',
      description: 'Every product is sourced from verified pharmacies and manufacturers — never a grey-market substitute.',
    },
    {
      iconKey: 'compass',
      title: 'Our Vision & Mission',
      description:
        'To build a trusted and progressive healthcare and wellness company that improves everyday lives through quality, innovation, and responsible care.',
    },
    {
      iconKey: 'rx',
      title: 'Our Commitment to Care',
      description:
        'Prescription medicines are verified before dispatch, and every order carries transparent, GST-inclusive pricing — no surprises at checkout.',
    },
    {
      iconKey: 'lock',
      title: 'Why Choose BRENTIS',
      description: 'Razorpay-secured payments, tracked delivery, and support that treats a health purchase as seriously as you do.',
    },
  ],
  highlightsTagline: 'Why BRENTIS',
  highlightsHeading: 'A Brand Built Around Care.',
  highlightsDescription:
    'Ordering medicines and wellness essentials online means trusting what you can’t physically inspect first — these are the operational commitments that make that trust possible.',
  highlightsImageUrl: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=1200&q=80',
  highlightsImagePublicId: null,
  highlightsImageAlt: 'Healthcare professional consulting a patient',
  highlights: [
    { iconKey: 'verified', title: 'Verified Sourcing', description: 'Every product comes from verified pharmacies and manufacturers.' },
    { iconKey: 'lock', title: 'Secure Checkout', description: 'Razorpay-protected payments — card, UPI, netbanking and wallets accepted.' },
    { iconKey: 'truck', title: 'Tracked Delivery', description: 'Real-time order status from confirmation to doorstep.' },
    { iconKey: 'rx', title: 'Prescription-Aware', description: 'Medicines that need a prescription are clearly flagged and handled accordingly.' },
  ],
};

const BRANDS = [
  { name: 'MedCare Pharma', slug: 'medcare-pharma' },
  { name: 'VitaWell', slug: 'vitawell' },
];

const MANUFACTURER = {
  name: 'KarienLabs Formulations Pvt. Ltd.',
  slug: 'karienlabs-formulations-pvt-ltd',
};

interface ProductSeed {
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription: string;
  categorySlug: string;
  brandSlug: string;
  manufacturerSlug: string;
  medicine: {
    genericName: string;
    schedule: string;
  };
  gstRate: number;
  basePrice: number;
  mrp: number;
  imageUrl: string;
  imagePublicId: string;
  batch: {
    quantity: number;
    unitCost: number;
    expiryDate: string;
  };
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Paracetamol 500mg Tablets',
    slug: 'paracetamol-500mg-tablets',
    sku: 'PARA-500-TAB',
    description:
      'Paracetamol 500mg Tablets (Paracetamol) is a professionally formulated product for pain relief & fever, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Paracetamol 500mg Tablets for trusted, everyday pain relief & fever.',
    categorySlug: 'pain-relief-fever',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Paracetamol', schedule: 'none' },
    gstRate: 12,
    basePrice: 25,
    mrp: 32,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 17.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Ibuprofen 400mg Tablets',
    slug: 'ibuprofen-400mg-tablets',
    sku: 'IBU-400-TAB',
    description:
      'Ibuprofen 400mg Tablets (Ibuprofen) is a professionally formulated product for pain relief & fever, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Ibuprofen 400mg Tablets for trusted, everyday pain relief & fever.',
    categorySlug: 'pain-relief-fever',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Ibuprofen', schedule: 'none' },
    gstRate: 12,
    basePrice: 45,
    mrp: 58,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 31.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Daily Multivitamin Capsules',
    slug: 'daily-multivitamin-capsules',
    sku: 'MVIT-DLY-CAP',
    description:
      'Daily Multivitamin Capsules (Multivitamin) is a professionally formulated product for vitamins & supplements, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Daily Multivitamin Capsules for trusted, everyday vitamins & supplements.',
    categorySlug: 'vitamins-supplements',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Multivitamin', schedule: 'none' },
    gstRate: 12,
    basePrice: 280,
    mrp: 340,
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    imagePublicId: 'external/unsplash-vitamins-arranged',
    batch: { quantity: 150, unitCost: 196, expiryDate: '2028-01-01' },
  },
  {
    name: 'Vitamin C 1000mg Tablets',
    slug: 'vitamin-c-1000mg-tablets',
    sku: 'VITC-1000-TAB',
    description:
      'Vitamin C 1000mg Tablets (Ascorbic Acid) is a professionally formulated product for vitamins & supplements, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Vitamin C 1000mg Tablets for trusted, everyday vitamins & supplements.',
    categorySlug: 'vitamins-supplements',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Ascorbic Acid', schedule: 'none' },
    gstRate: 12,
    basePrice: 195,
    mrp: 240,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 136.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Metformin 500mg Tablets',
    slug: 'metformin-500mg-tablets',
    sku: 'MET-500D-TAB',
    description:
      'Metformin 500mg Tablets (Metformin) is a professionally formulated product for diabetes care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Metformin 500mg Tablets for trusted, everyday diabetes care.',
    categorySlug: 'diabetes-care',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Metformin', schedule: 'schedule_h' },
    gstRate: 12,
    basePrice: 38,
    mrp: 48,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 26.6, expiryDate: '2028-01-01' },
  },
  {
    name: 'Glimepiride 2mg Tablets',
    slug: 'glimepiride-2mg-tablets',
    sku: 'GLIM-2D-TAB',
    description:
      'Glimepiride 2mg Tablets (Glimepiride) is a professionally formulated product for diabetes care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Glimepiride 2mg Tablets for trusted, everyday diabetes care.',
    categorySlug: 'diabetes-care',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Glimepiride', schedule: 'schedule_h' },
    gstRate: 12,
    basePrice: 55,
    mrp: 68,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 38.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Antacid Suspension 200ml',
    slug: 'antacid-suspension-200ml',
    sku: 'ANTA-SUS-200',
    description:
      'Antacid Suspension 200ml (Aluminium Hydroxide) is a professionally formulated product for digestive health, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Antacid Suspension 200ml for trusted, everyday digestive health.',
    categorySlug: 'digestive-health',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Aluminium Hydroxide', schedule: 'none' },
    gstRate: 12,
    basePrice: 85,
    mrp: 105,
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    imagePublicId: 'external/unsplash-vitamins-arranged',
    batch: { quantity: 150, unitCost: 59.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Probiotic Gut Health Capsules',
    slug: 'probiotic-gut-health-capsules',
    sku: 'PROB-GUT-CAP',
    description:
      'Probiotic Gut Health Capsules (Lactobacillus) is a professionally formulated product for digestive health, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Probiotic Gut Health Capsules for trusted, everyday digestive health.',
    categorySlug: 'digestive-health',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Lactobacillus', schedule: 'none' },
    gstRate: 12,
    basePrice: 320,
    mrp: 395,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 224, expiryDate: '2028-01-01' },
  },
  {
    name: 'Cetirizine 10mg Tablets',
    slug: 'cetirizine-10mg-tablets',
    sku: 'CET-10D-TAB',
    description:
      'Cetirizine 10mg Tablets (Cetirizine) is a professionally formulated product for allergy & cold, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Cetirizine 10mg Tablets for trusted, everyday allergy & cold.',
    categorySlug: 'allergy-cold',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Cetirizine', schedule: 'none' },
    gstRate: 12,
    basePrice: 28,
    mrp: 35,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 19.6, expiryDate: '2028-01-01' },
  },
  {
    name: 'Cold & Cough Syrup 100ml',
    slug: 'cold-cough-syrup-100ml',
    sku: 'COLD-SYR-100',
    description:
      'Cold & Cough Syrup 100ml (Dextromethorphan) is a professionally formulated product for allergy & cold, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Cold & Cough Syrup 100ml for trusted, everyday allergy & cold.',
    categorySlug: 'allergy-cold',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Dextromethorphan', schedule: 'none' },
    gstRate: 12,
    basePrice: 95,
    mrp: 120,
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    imagePublicId: 'external/unsplash-vitamins-arranged',
    batch: { quantity: 150, unitCost: 66.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Hand Sanitizer Gel 250ml',
    slug: 'hand-sanitizer-gel-250ml',
    sku: 'HSAN-GEL-250',
    description:
      'Hand Sanitizer Gel 250ml (Ethyl Alcohol 70%) is a professionally formulated product for personal care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Hand Sanitizer Gel 250ml for trusted, everyday personal care.',
    categorySlug: 'personal-care',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Ethyl Alcohol 70%', schedule: 'none' },
    gstRate: 12,
    basePrice: 110,
    mrp: 140,
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80',
    imagePublicId: 'external/unsplash-personal-care',
    batch: { quantity: 150, unitCost: 77, expiryDate: '2028-01-01' },
  },
  {
    name: 'Gentle Face Cleanser 100ml',
    slug: 'gentle-face-cleanser-100ml',
    sku: 'FCLN-GTL-100',
    description:
      'Gentle Face Cleanser 100ml (Cleansing Lotion) is a professionally formulated product for personal care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Gentle Face Cleanser 100ml for trusted, everyday personal care.',
    categorySlug: 'personal-care',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Cleansing Lotion', schedule: 'none' },
    gstRate: 12,
    basePrice: 245,
    mrp: 299,
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80',
    imagePublicId: 'external/unsplash-personal-care',
    batch: { quantity: 150, unitCost: 171.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Baby Moisturizing Lotion 200ml',
    slug: 'baby-moisturizing-lotion-200ml',
    sku: 'BABY-LOT-200',
    description:
      'Baby Moisturizing Lotion 200ml (Baby Lotion) is a professionally formulated product for baby & mother care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Baby Moisturizing Lotion 200ml for trusted, everyday baby & mother care.',
    categorySlug: 'baby-mother-care',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Baby Lotion', schedule: 'none' },
    gstRate: 12,
    basePrice: 189,
    mrp: 225,
    imageUrl: 'https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=800&q=80',
    imagePublicId: 'external/unsplash-baby-care',
    batch: { quantity: 150, unitCost: 132.3, expiryDate: '2028-01-01' },
  },
  {
    name: 'Omega-3 Fish Oil Capsules',
    slug: 'omega-3-fish-oil-capsules',
    sku: 'OME3-FSH-CAP',
    description:
      'Omega-3 Fish Oil Capsules (Omega-3 Fatty Acids) is a professionally formulated product for wellness & heart health, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Omega-3 Fish Oil Capsules for trusted, everyday wellness & heart health.',
    categorySlug: 'wellness-heart-health',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Omega-3 Fatty Acids', schedule: 'none' },
    gstRate: 12,
    basePrice: 410,
    mrp: 499,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 287, expiryDate: '2028-01-01' },
  },
  {
    name: 'Coenzyme Q10 60mg Capsules',
    slug: 'coenzyme-q10-60mg-capsules',
    sku: 'COQ10-60-CAP',
    description:
      'Coenzyme Q10 60mg Capsules (Ubiquinone) is a professionally formulated product for wellness & heart health, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Coenzyme Q10 60mg Capsules for trusted, everyday wellness & heart health.',
    categorySlug: 'wellness-heart-health',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Ubiquinone', schedule: 'none' },
    gstRate: 12,
    basePrice: 450,
    mrp: 550,
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    imagePublicId: 'external/unsplash-vitamins-arranged',
    batch: { quantity: 150, unitCost: 315, expiryDate: '2028-01-01' },
  },
  {
    name: 'Daily Fiber Heart Health Powder',
    slug: 'daily-fiber-heart-health-powder',
    sku: 'FIBR-HRT-200',
    description:
      'Daily Fiber Heart Health Powder (Psyllium Husk) is a professionally formulated product for wellness & heart health, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Daily Fiber Heart Health Powder for trusted, everyday wellness & heart health.',
    categorySlug: 'wellness-heart-health',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Psyllium Husk', schedule: 'none' },
    gstRate: 12,
    basePrice: 265,
    mrp: 320,
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80',
    imagePublicId: 'external/unsplash-fitness-class',
    batch: { quantity: 150, unitCost: 185.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Daily Moisturizing Body Lotion 300ml',
    slug: 'daily-moisturizing-body-lotion-300ml',
    sku: 'BLTN-MST-300',
    description:
      'Daily Moisturizing Body Lotion 300ml (Body Lotion) is a professionally formulated product for personal care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Daily Moisturizing Body Lotion 300ml for trusted, everyday personal care.',
    categorySlug: 'personal-care',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Body Lotion', schedule: 'none' },
    gstRate: 12,
    basePrice: 175,
    mrp: 215,
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80',
    imagePublicId: 'external/unsplash-personal-care',
    batch: { quantity: 150, unitCost: 122.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Antiseptic Liquid 500ml',
    slug: 'antiseptic-liquid-500ml',
    sku: 'ANTS-LIQ-500',
    description:
      'Antiseptic Liquid 500ml (Chloroxylenol) is a professionally formulated product for personal care, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Antiseptic Liquid 500ml for trusted, everyday personal care.',
    categorySlug: 'personal-care',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Chloroxylenol', schedule: 'none' },
    gstRate: 12,
    basePrice: 95,
    mrp: 120,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 66.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Aspirin 75mg Tablets',
    slug: 'aspirin-75mg-tablets',
    sku: 'ASPR-75-TAB',
    description:
      'Aspirin 75mg Tablets (Acetylsalicylic Acid) is a professionally formulated product for pain relief & fever, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Aspirin 75mg Tablets for trusted, everyday pain relief & fever.',
    categorySlug: 'pain-relief-fever',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Acetylsalicylic Acid', schedule: 'none' },
    gstRate: 12,
    basePrice: 32,
    mrp: 40,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 22.4, expiryDate: '2028-01-01' },
  },
  {
    name: 'Diclofenac Gel 30g',
    slug: 'diclofenac-gel-30g',
    sku: 'DICL-GEL-30',
    description:
      'Diclofenac Gel 30g (Diclofenac Diethylamine) is a professionally formulated product for pain relief & fever, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Diclofenac Gel 30g for trusted, everyday pain relief & fever.',
    categorySlug: 'pain-relief-fever',
    brandSlug: 'medcare-pharma',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Diclofenac Diethylamine', schedule: 'none' },
    gstRate: 12,
    basePrice: 115,
    mrp: 140,
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    imagePublicId: 'external/unsplash-capsules-orange',
    batch: { quantity: 150, unitCost: 80.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Zinc 50mg Tablets',
    slug: 'zinc-50mg-tablets',
    sku: 'ZINC-50-TAB',
    description:
      'Zinc 50mg Tablets (Zinc Sulphate) is a professionally formulated product for vitamins & supplements, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Zinc 50mg Tablets for trusted, everyday vitamins & supplements.',
    categorySlug: 'vitamins-supplements',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Zinc Sulphate', schedule: 'none' },
    gstRate: 12,
    basePrice: 165,
    mrp: 199,
    imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80',
    imagePublicId: 'external/unsplash-blister-pack',
    batch: { quantity: 150, unitCost: 115.5, expiryDate: '2028-01-01' },
  },
  {
    name: 'Vitamin D3 2000IU Capsules',
    slug: 'vitamin-d3-2000iu-capsules',
    sku: 'VITD3-2K-CAP',
    description:
      'Vitamin D3 2000IU Capsules (Cholecalciferol) is a professionally formulated product for vitamins & supplements, manufactured under strict quality standards by KarienLabs Formulations.',
    shortDescription: 'Vitamin D3 2000IU Capsules for trusted, everyday vitamins & supplements.',
    categorySlug: 'vitamins-supplements',
    brandSlug: 'vitawell',
    manufacturerSlug: 'karienlabs-formulations-pvt-ltd',
    medicine: { genericName: 'Cholecalciferol', schedule: 'none' },
    gstRate: 12,
    basePrice: 310,
    mrp: 375,
    imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
    imagePublicId: 'external/unsplash-vitamins-arranged',
    batch: { quantity: 150, unitCost: 217, expiryDate: '2028-01-01' },
  },
];

const BLOGS = [
  {
    title: 'Everyday Vitamin & Nutrition Guide',
    slug: 'everyday-vitamin-nutrition-guide',
    excerpt:
      'A practical guide to the vitamins and minerals your body needs every day, and simple ways to get enough of them through diet and supplements.',
    // Prompt-2 refinement: the original Cloudinary cover was a generated
    // placeholder graphic (solid-color box + title text baked into the
    // pixels) — the same class of asset already root-caused and fixed for
    // product images (see docs/BRENTIS_VISUAL_AUDIT.md §I and the prior
    // workflow's product-image fix). Swapped for real, individually
    // opened-and-verified, unbranded stock photography, same process used
    // for the homepage/category images.
    coverImageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=900&q=80',
    tags: ['Wellness'],
  },
  {
    title: 'Understanding Common Cold Symptoms',
    slug: 'understanding-common-cold-symptoms',
    excerpt:
      "Cold season is here — learn to recognize common symptoms, when home care is enough, and when it's time to see a doctor.",
    coverImageUrl: 'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=900&q=80',
    tags: ['Healthcare Tips'],
  },
  {
    title: 'Building Healthy Lifestyle Habits',
    slug: 'building-healthy-lifestyle-habits',
    excerpt:
      "Small, consistent changes in diet, movement, and sleep can add up to lasting health improvements. Here's where to start.",
    coverImageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&q=80',
    tags: ['Lifestyle'],
  },
  {
    title: 'Medication Safety Basics at Home',
    slug: 'medication-safety-basics-at-home',
    excerpt:
      "Simple habits — proper storage, checking expiry dates, and avoiding self-medication — that keep your household's medicine cabinet safe.",
    coverImageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=900&q=80',
    tags: ['Medicine Guide'],
  },
  {
    title: 'Preventive Care for a Healthier Life',
    slug: 'preventive-care-for-a-healthier-life',
    excerpt:
      "Preventive checkups and screenings catch issues early. Here's a general overview of preventive care worth prioritizing.",
    coverImageUrl: 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=900&q=80',
    tags: ['Wellness'],
  },
];

// `linkCategorySlug: null` means the CTA links somewhere that isn't
// category-scoped (e.g. plain `/products`) — resolved to a literal `linkUrl`
// as-is. Otherwise the category's freshly-resolved target-database ObjectId
// is substituted in at write time, so a banner never ships with a
// categoryId that only existed in the source database.
const BANNERS: Array<{
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  imagePublicId: string | null;
  linkPath: string;
  linkCategorySlug: string | null;
  ctaText: string;
  placement: 'hero' | 'category' | 'checkout';
  order: number;
}> = [
    {
      title: 'Your Health, Delivered with Care',
      subtitle: 'Order from verified pharmacies with fast, reliable delivery and secure payments.',
      badge: 'Trusted by thousands',
      // Dynamic CMS (Prompt 3) — the original Cloudinary asset here was the
      // same class of generated-placeholder graphic (headline/CTA baked into
      // the image pixels) previously root-caused and fixed for product/blog
      // cover images; once the homepage started reading REAL seeded Banner
      // documents (instead of the 3 hand-picked clean HERO_SLIDES this
      // replaces), the baked-in text collided with HeroCarousel's own live
      // text overlay — the exact bug class described in this file's own
      // BLOGS comment. Swapped for real, individually verified, text-free
      // stock photography, same standard used everywhere else in this file.
      imageUrl: 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=1600&q=80',
      imagePublicId: null,
      linkPath: '/products',
      linkCategorySlug: null,
      ctaText: 'Shop Now',
      placement: 'hero',
      order: 1,
    },
    {
      title: 'Vitamins & Supplements for Every Day',
      subtitle: 'Curated wellness essentials to support your daily routine.',
      badge: 'Wellness made simple',
      imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1600&q=80',
      imagePublicId: null,
      linkPath: '/products',
      linkCategorySlug: 'vitamins-supplements',
      ctaText: 'Explore Wellness',
      placement: 'hero',
      order: 1,
    },
    {
      title: 'Flat 20% Off Diabetes Care Essentials',
      subtitle: 'Save on trusted diabetes management products.',
      badge: 'Limited Time',
      imageUrl: 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=900&q=80',
      imagePublicId: null,
      linkPath: '/products',
      linkCategorySlug: 'diabetes-care',
      ctaText: 'Shop Diabetes Care',
      placement: 'category',
      order: 1,
    },
    {
      title: '15% Off Your First Order',
      subtitle: 'New to BRENTIS HEALTHCARE? Start with savings on your first purchase.',
      badge: 'New Customer Offer',
      imageUrl: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=900&q=80',
      imagePublicId: null,
      linkPath: '/products',
      linkCategorySlug: null,
      ctaText: 'Get Started',
      placement: 'category',
      order: 1,
    },
    {
      title: 'Allergy & Cold Relief Bundle Deals',
      subtitle: 'Stay ready for the season with allergy and cold essentials.',
      badge: 'Seasonal Care',
      imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=900&q=80',
      imagePublicId: null,
      linkPath: '/products',
      linkCategorySlug: 'allergy-cold',
      ctaText: 'View Offers',
      placement: 'category',
      order: 1,
    },
  ];

interface Counts {
  created: number;
  reused: number;
}

function bump(counts: Counts, wasCreated: boolean): void {
  if (wasCreated) counts.created += 1;
  else counts.reused += 1;
}

async function migrate(): Promise<void> {
  await connectDatabase();

  const report: Record<string, Counts> = {};
  const track = (key: string): Counts => (report[key] ??= { created: 0, reused: 0 });

  const admin = await UserModel.findOne({
    role: { $in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  })
    .sort({ role: 1 }) // 'admin' < 'super_admin' alphabetically is irrelevant; sort only for determinism
    .lean();
  if (!admin) {
    throw new Error(
      'No super_admin/admin user found in the target database — refusing to guess an author/creator. ' +
      'Run seed:super-admin first, or create an admin account, then re-run this script.',
    );
  }
  const adminId = admin._id;

  // --- Seller -------------------------------------------------------------
  const sellerCounts = track('sellers');
  let seller = await SellerModel.findOne({ gstin: SELLER.gstin });
  if (!seller) {
    seller = await SellerModel.create({ ...SELLER, createdBy: adminId });
    bump(sellerCounts, true);
  } else {
    bump(sellerCounts, false);
  }

  // --- Warehouse ------------------------------------------------------------
  const warehouseCounts = track('warehouses');
  let warehouse = await WarehouseModel.findOne({ code: WAREHOUSE.code });
  if (!warehouse) {
    warehouse = await WarehouseModel.create({
      ...WAREHOUSE,
      sellerId: seller._id,
      createdBy: adminId,
    });
    bump(warehouseCounts, true);
  } else {
    bump(warehouseCounts, false);
  }

  // --- Categories -----------------------------------------------------------
  const categoryCounts = track('categories');
  const categoryImageCounts = track('category_images');
  const categoryIdBySlug = new Map<string, unknown>();
  for (const cat of CATEGORIES) {
    let doc = await CategoryModel.findOne({ slug: cat.slug });
    if (!doc) {
      doc = await CategoryModel.create({ ...cat, createdBy: adminId });
      bump(categoryCounts, true);
    } else {
      bump(categoryCounts, false);
    }
    categoryIdBySlug.set(cat.slug, doc._id);

    // Dynamic CMS (Prompt 3) — backfill a starter image only if the category
    // has none yet; never overwrites an image an admin has since set.
    const image = CATEGORY_IMAGES[cat.slug];
    if (image && !doc.imageUrl) {
      await CategoryModel.updateOne(
        { _id: doc._id },
        { $set: { imageUrl: image.url, imageAlt: image.alt, updatedBy: adminId } },
      );
      bump(categoryImageCounts, true);
    } else {
      bump(categoryImageCounts, false);
    }
  }

  // --- Brands -----------------------------------------------------------------
  const brandCounts = track('brands');
  const brandIdBySlug = new Map<string, unknown>();
  for (const brand of BRANDS) {
    let doc = await BrandModel.findOne({ slug: brand.slug });
    if (!doc) {
      doc = await BrandModel.create({ ...brand, createdBy: adminId });
      bump(brandCounts, true);
    } else {
      bump(brandCounts, false);
    }
    brandIdBySlug.set(brand.slug, doc._id);
  }

  // --- Manufacturer -------------------------------------------------------
  const manufacturerCounts = track('manufacturers');
  let manufacturer = await ManufacturerModel.findOne({ slug: MANUFACTURER.slug });
  if (!manufacturer) {
    manufacturer = await ManufacturerModel.create({ ...MANUFACTURER, createdBy: adminId });
    bump(manufacturerCounts, true);
  } else {
    bump(manufacturerCounts, false);
  }

  // --- Products (+ opening stock batch) --------------------------------------
  const productCounts = track('products');
  const batchCounts = track('batches');
  for (const p of PRODUCTS) {
    let product = await ProductModel.findOne({ $or: [{ slug: p.slug }, { sku: p.sku }] });
    if (!product) {
      product = await ProductModel.create({
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        shortDescription: p.shortDescription,
        categoryId: categoryIdBySlug.get(p.categorySlug),
        brandId: brandIdBySlug.get(p.brandSlug),
        manufacturerId: manufacturer._id,
        medicine: { genericName: p.medicine.genericName, schedule: p.medicine.schedule },
        gstRate: p.gstRate,
        basePrice: p.basePrice,
        mrp: p.mrp,
        isActive: true,
        images: [{ url: p.imageUrl, publicId: p.imagePublicId, isPrimary: true, order: 0 }],
        createdBy: adminId,
      });
      bump(productCounts, true);
    } else {
      bump(productCounts, false);
    }

    const batchNumber = `DEMO-${p.sku}`;
    const existingBatch = await BatchModel.findOne({
      productId: product._id,
      warehouseId: warehouse._id,
      batchNumber,
    });
    if (!existingBatch) {
      await BatchModel.create({
        productId: product._id,
        warehouseId: warehouse._id,
        batchNumber,
        expiryDate: new Date(p.batch.expiryDate),
        quantityReceived: p.batch.quantity,
        quantityAvailable: p.batch.quantity,
        unitCost: p.batch.unitCost,
        mrp: p.mrp,
        status: 'active',
        createdBy: adminId,
      });
      bump(batchCounts, true);
    } else {
      bump(batchCounts, false);
    }
  }

  // --- Blogs ------------------------------------------------------------------
  const blogCounts = track('blogs');
  for (const b of BLOGS) {
    const existing = await BlogModel.findOne({ slug: b.slug });
    if (!existing) {
      await BlogModel.create({
        title: b.title,
        slug: b.slug,
        excerpt: b.excerpt,
        content: `${b.excerpt} This article is provided by the KarienLabs editorial and pharmacy team for general health education purposes only, and is not a substitute for professional medical advice.`,
        coverImageUrl: b.coverImageUrl,
        authorId: adminId,
        tags: b.tags,
        isPublished: true,
        createdBy: adminId,
      });
      bump(blogCounts, true);
    } else {
      bump(blogCounts, false);
    }
  }

  // --- Banners ------------------------------------------------------------
  const bannerCounts = track('banners');
  for (const b of BANNERS) {
    const existing = await BannerModel.findOne({ title: b.title, placement: b.placement });
    if (!existing) {
      const linkUrl = b.linkCategorySlug
        ? `${b.linkPath}?categoryId=${String(categoryIdBySlug.get(b.linkCategorySlug))}`
        : b.linkPath;
      await BannerModel.create({
        title: b.title,
        subtitle: b.subtitle,
        badge: b.badge,
        imageUrl: b.imageUrl,
        imageAlt: b.title,
        imagePublicId: b.imagePublicId,
        linkUrl,
        ctaText: b.ctaText,
        placement: b.placement,
        order: b.order,
        isActive: true,
        createdBy: adminId,
      });
      bump(bannerCounts, true);
    } else {
      bump(bannerCounts, false);
    }
  }

  // --- Home sections (Best Sellers category tabs — Prompt 4 §7) -----------
  // Real, existing BRENTIS catalog categories only (never invented ones like
  // "Sun Care"/"Hair Care" from the Brintoncare reference, which doesn't
  // sell this catalog) — demonstrates the feature without fabricating
  // anything. Order here is the tab order; first tab is default-active.
  const homeSectionCounts = track('home_sections');
  const BEST_SELLER_TAB_SLUGS = ['pain-relief-fever', 'vitamins-supplements', 'personal-care', 'wellness-heart-health'];
  const existingBestSellers = await HomeSectionModel.findOne({ title: 'Best Sellers', type: 'category_tabs' });
  if (!existingBestSellers) {
    const tabCategoryIds = BEST_SELLER_TAB_SLUGS.map((slug) => categoryIdBySlug.get(slug)).filter(Boolean);
    await HomeSectionModel.create({
      title: 'Best Sellers',
      type: 'category_tabs',
      sourceType: 'category',
      categoryIds: tabCategoryIds,
      order: 1,
      isActive: true,
      createdBy: adminId,
    });
    bump(homeSectionCounts, true);
  } else {
    bump(homeSectionCounts, false);
  }

  // --- Pages (About Us + the 6 live policy routes) ------------------------
  // Dynamic CMS (Prompt 3) — real content extracted from WEBSITE
  // DOCUMENTATION.docx and aboutus.txt (see policy-pages.generated.ts's own
  // header comment). Only creates a Page if one doesn't already exist for
  // that slug — never overwrites content an admin has since edited.
  const pageCounts = track('pages');
  for (const [slug, content] of Object.entries(GENERATED_PAGES)) {
    const existing = await PageModel.findOne({ slug });
    if (!existing) {
      await PageModel.create({
        slug,
        title: content.title,
        content: content.html,
        isPublished: true,
        createdBy: adminId,
      });
      bump(pageCounts, true);
    } else {
      bump(pageCounts, false);
    }
  }

  // --- About Us homepage teaser content ------------------------------------
  // Dynamic CMS (Prompt 3) — only seeds if nothing has been saved under the
  // 'about' Configuration namespace yet (an empty object means "never set").
  const aboutCounts = track('about_content');
  const existingAbout = await getConfiguration('about');
  if (!existingAbout || Object.keys(existingAbout).length === 0) {
    await setConfiguration('about', ABOUT_CONTENT_SEED, String(adminId));
    bump(aboutCounts, true);
  } else {
    bump(aboutCounts, false);
  }

  logger.info({ report }, 'Demo content migration complete');
  // eslint-disable-next-line no-console
  console.log('\n=== Demo content migration report ===');
  for (const [key, counts] of Object.entries(report)) {
    // eslint-disable-next-line no-console
    console.log(`${key.padEnd(14)} created=${counts.created}  reused=${counts.reused}`);
  }

  await disconnectDatabase();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Demo content migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
