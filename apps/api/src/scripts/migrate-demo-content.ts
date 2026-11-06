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
    title: 'Apple Cider Vinegar Effervescent Tablets: A Guide to ACV, Everyday Wellness and Responsible Use',
    slug: 'apple-cider-vinegar-effervescent-tablets',
    excerpt: 'Discover what apple cider vinegar effervescent tablets are, how ACV fits into a balanced lifestyle, and what to consider before using them.',
    content: `<p>Apple cider vinegar, commonly known as ACV, has become a popular ingredient in wellness products. From traditional liquid vinegar to convenient effervescent tablets, ACV is available in several formats for people interested in exploring different approaches to everyday nutrition.</p>
<p>However, understanding what apple cider vinegar actually contains, what scientific research says about it and how to choose a suitable supplement is essential before incorporating it into your routine.</p>
<p>At BRENTIS, a wellness brand owned by Brentis Healthcare, we believe that informed decisions begin with accurate information. This guide explores apple cider vinegar, its potential nutritional relevance and the considerations surrounding ACV effervescent tablets.</p>
<h2>What Is Apple Cider Vinegar?</h2>
<p>Apple cider vinegar is produced through the fermentation of apple juice.</p>
<p>During fermentation, naturally occurring sugars are converted into alcohol, which is subsequently converted into acetic acid by certain bacteria.</p>
<p>Acetic acid is responsible for much of vinegar's characteristic sour taste and smell.</p>
<p>The composition of apple cider vinegar can vary depending on the apples used, fermentation process and manufacturing method.</p>
<p>Some ACV products are consumed as liquid vinegar, while others are formulated into capsules, tablets or effervescent preparations.</p>
<h2>What Are ACV Effervescent Tablets?</h2>
<p>Effervescent tablets are designed to dissolve in water before consumption.</p>
<p>They typically contain ingredients that react in water to produce carbon dioxide, creating a fizzy beverage.</p>
<p>ACV effervescent tablets provide an alternative format for adults who prefer a drink rather than conventional tablets or liquid vinegar.</p>
<p>The nutritional composition of these products depends on their specific formulation. Not all ACV tablets contain the same quantity of apple cider vinegar or acetic acid.</p>
<p>Consumers should therefore check the ingredient list and serving information rather than assuming all products are equivalent.</p>
<h2>Potential Benefits of Apple Cider Vinegar: What Does Research Say?</h2>
<p>Apple cider vinegar has been investigated for several potential physiological effects.</p>
<p>Some small studies have examined its relationship with blood glucose levels, body weight and other metabolic measures.</p>
<p>However, research remains limited, and results vary across studies.</p>
<p>Importantly, findings from research involving liquid vinegar cannot automatically be applied to ACV tablets or other formulations.</p>
<h2>ACV and Weight Management</h2>
<p>Apple cider vinegar is frequently promoted as a weight-management ingredient.</p>
<p>Some preliminary studies have reported changes in body weight or other measurements among participants consuming vinegar.</p>
<p>However, the available evidence is not sufficient to establish ACV as a reliable or effective weight-loss treatment.</p>
<p>Sustainable weight management depends on several factors, including dietary habits, physical activity, sleep and individual health circumstances.</p>
<p>ACV supplements should not replace balanced meals, regular physical activity or professional advice when weight management is a health concern.</p>
<h2>ACV and Blood Glucose</h2>
<p>Research has also examined whether vinegar consumption may influence post-meal blood glucose levels.</p>
<p>Although some studies have reported potential effects, the evidence is not sufficient to recommend ACV as a treatment for diabetes or as a substitute for prescribed medication.</p>
<p>People living with diabetes should consult their healthcare professional before using ACV supplements, particularly if they take medicines that lower blood glucose.</p>
<h2>How to Choose an ACV Effervescent Tablet</h2>
<p>When evaluating an ACV supplement, consider the following:</p>
<ul><li>Ingredient quantity: Check the amount of apple cider vinegar or acetic acid per serving.</li><li>Complete formulation: Review sweeteners, flavouring agents, sodium and other ingredients.</li><li>Recommended intake: Follow the product's directions rather than increasing the serving size.</li><li>Product quality: Look for clear manufacturing, sourcing and quality information.</li><li>Safety information: Check the label for precautions and suitability.</li></ul>
<p>The term &quot;effervescent&quot; describes the delivery format. It does not automatically mean a product is more effective than liquid vinegar or another supplement format.</p>
<h2>Who Should Exercise Caution With ACV Supplements?</h2>
<p>Apple cider vinegar is acidic, and excessive consumption may cause digestive discomfort or contribute to dental enamel erosion.</p>
<p>People with acid reflux, gastrointestinal conditions or a history of sensitivity to acidic foods should exercise caution.</p>
<p>Those taking medication for diabetes or other medical conditions should seek professional advice before using ACV supplements.</p>
<p>Pregnant or breastfeeding individuals should consult a qualified healthcare professional before starting a new supplement.</p>
<h2>BRENTIS ACV Effervescent Tablets</h2>
<p>BRENTIS ACV Effervescent Tablets are part of the wellness product range offered by Brentis Healthcare.</p>
<p>The product is intended for adults interested in exploring apple cider vinegar in an effervescent format.</p>
<p>Before use, review the product's complete ingredient list, serving information, directions and safety precautions.</p>
<p>Do not use ACV supplements as a replacement for a balanced diet, prescribed medication or professional healthcare advice.</p>
<h2>Frequently Asked Questions</h2>
<h3>Are ACV effervescent tablets better than liquid apple cider vinegar?</h3>
<p>Not necessarily. The nutritional composition and potential effects depend on the formulation, including the quantity of acetic acid and other ingredients.</p>
<h3>Can ACV tablets help me lose weight?</h3>
<p>There is insufficient evidence to establish ACV tablets as an effective weight-loss treatment. Sustainable weight management involves dietary habits, physical activity and other lifestyle factors.</p>
<h3>Can I take ACV tablets every day?</h3>
<p>Follow the recommended usage on the product label. Consult a healthcare professional if you have a medical condition or take medication.</p>
<h3>Do ACV tablets replace a healthy diet?</h3>
<p>No. Supplements should complement a varied, balanced diet rather than replace it.</p>
<h2>Final Thoughts</h2>
<p>Apple cider vinegar is a familiar ingredient that has attracted interest in the wellness industry.</p>
<p>Understanding its composition, potential effects and limitations can help consumers make more informed decisions.</p>
<p>Whether choosing liquid vinegar or an effervescent supplement, prioritise product quality, responsible use and realistic expectations.</p>
<p>BRENTIS — Wellness begins with informed choices.</p>
<blockquote><em>Medical disclaimer: This article is for general educational purposes only and does not constitute medical advice. ACV supplements are not intended to diagnose, treat, cure or prevent disease. Consult a qualified healthcare professional before use if you have an existing medical condition, take medication, or are pregnant or breastfeeding.</em></blockquote>`,
    coverImageUrl: 'https://images.unsplash.com/photo-1592109580135-915af34dc50b?w=900&q=80',
    metaTitle: 'Apple Cider Vinegar Effervescent Tablets: Benefits, Uses and Safety | BRENTIS',
    metaDescription: 'Discover what apple cider vinegar effervescent tablets are, how ACV fits into a balanced lifestyle, and what to consider before using them.',
    tags: ['Supplements'],
  },
  {
    title: 'Vitamin C + Zinc Effervescent Tablets: Understanding Two Essential Nutrients',
    slug: 'vitamin-c-zinc-effervescent-tablets',
    excerpt: 'Learn about Vitamin C and zinc, their nutritional functions, the advantages of effervescent supplements and how to use them responsibly.',
    content: `<p>A balanced diet provides the nutrients required for normal bodily functions. Among these nutrients, Vitamin C and zinc play important roles in several physiological processes.</p>
<p>Vitamin C is a water-soluble vitamin, while zinc is an essential mineral. Both contribute to normal immune system function, and both are available through a variety of foods.</p>
<p>For adults whose dietary intake may be insufficient, supplements can provide another way to obtain these nutrients.</p>
<p>BRENTIS Vitamin C + Zinc Effervescent Tablets are part of the wellness range offered by Brentis Healthcare. This guide explains the nutritional functions of Vitamin C and zinc, the effervescent format and the importance of responsible supplementation.</p>
<h2>What Is Vitamin C?</h2>
<p>Vitamin C, also known as ascorbic acid, is a water-soluble vitamin that the body requires for several normal physiological functions.</p>
<p>Unlike some animals, humans cannot produce Vitamin C internally and must obtain it through food or other appropriate sources.</p>
<p>Common dietary sources include:</p>
<ul><li>Oranges and other citrus fruits.</li><li>Guava.</li><li>Amla.</li><li>Capsicum.</li><li>Broccoli.</li><li>Tomatoes.</li></ul>
<p>The amount of Vitamin C in food can vary depending on the variety, storage and preparation method.</p>
<h2>What Does Vitamin C Do in the Body?</h2>
<p>Vitamin C contributes to several established nutritional functions.</p>
<h2>Normal Immune System Function</h2>
<p>Vitamin C contributes to the normal functioning of the immune system.</p>
<p>However, this does not mean that taking a Vitamin C supplement guarantees protection against infections or prevents illness.</p>
<h2>Collagen Formation</h2>
<p>Vitamin C contributes to normal collagen formation, which is important for the normal function of skin, bones, cartilage, gums and blood vessels.</p>
<h2>Protection Against Oxidative Stress</h2>
<p>Vitamin C contributes to the protection of cells from oxidative stress.</p>
<p>Oxidative stress is a process involving an imbalance between free radicals and the body's antioxidant defences.</p>
<h2>Iron Absorption</h2>
<p>Vitamin C increases the absorption of iron from plant-based foods.</p>
<p>This is one reason Vitamin C-rich foods are often included alongside iron-containing foods in balanced meals.</p>
<h2>What Is Zinc?</h2>
<p>Zinc is an essential mineral required for normal growth, development and several physiological processes.</p>
<p>Dietary sources of zinc include legumes, nuts, seeds, dairy products, whole grains and certain animal-based foods.</p>
<p>The amount absorbed from food depends partly on the type of food and the overall composition of the diet.</p>
<h2>Why Is Zinc Important?</h2>
<p>Zinc contributes to several normal bodily functions, including:</p>
<ul><li>Normal immune system function.</li><li>Normal DNA synthesis.</li><li>Normal protein synthesis.</li><li>Normal cell division.</li><li>Maintenance of normal skin, hair and nails.</li><li>Normal cognitive function.</li></ul>
<p>Zinc is also involved in the activity of many enzymes.</p>
<p>Although zinc is essential, consuming more than the required amount does not necessarily provide additional benefits.</p>
<h2>Why Combine Vitamin C and Zinc?</h2>
<p>Vitamin C and zinc are frequently combined in nutritional supplements because both are essential nutrients with established roles in normal physiological function.</p>
<p>The suitability of a combined supplement depends on its actual composition and the individual's nutritional requirements.</p>
<p>It is important to distinguish the normal functions of these nutrients from claims that a specific supplement can prevent or treat disease.</p>
<p>For example, a Vitamin C and zinc supplement should not be presented as a guaranteed way to prevent colds, cure infections or provide immediate immunity.</p>
<h2>What Are Effervescent Tablets?</h2>
<p>Effervescent tablets are designed to dissolve in water before consumption.</p>
<p>They create a fizzy beverage, offering an alternative to conventional tablets or capsules.</p>
<p>Some adults may find this format more convenient, particularly if they prefer drinking a supplement rather than swallowing a tablet.</p>
<p>However, the delivery format does not automatically make a supplement more effective.</p>
<p>The amount of Vitamin C, zinc, sodium and other ingredients depends on the individual formulation.</p>
<h2>How to Choose a Vitamin C + Zinc Supplement</h2>
<p>Before purchasing a supplement, review the following:</p>
<ul><li><strong>Vitamin C quantity:</strong> Helps you understand the amount per serving.</li><li><strong>Zinc quantity:</strong> Helps prevent excessive daily intake.</li><li><strong>Additional ingredients:</strong> Identifies sweeteners, flavouring agents and other substances.</li><li><strong>Recommended serving:</strong> Provides directions for responsible use.</li><li><strong>Safety precautions:</strong> Helps identify relevant warnings and suitability.</li></ul>
<p>The recommended daily intake depends on factors such as age, sex and individual circumstances.</p>
<p>Taking several supplements containing the same nutrients may increase the total intake beyond recommended levels.</p>
<h2>Can Excessive Vitamin C or Zinc Be Harmful?</h2>
<p>Yes. Although both nutrients are essential, excessive intake can cause adverse effects.</p>
<p>High Vitamin C intake may cause digestive discomfort, including diarrhoea and abdominal cramps.</p>
<p>Excessive zinc intake may cause nausea, vomiting and other gastrointestinal symptoms. Prolonged high intake can also interfere with copper absorption.</p>
<p>People with existing medical conditions or those taking medication should consult a healthcare professional before starting supplementation.</p>
<h2>BRENTIS Vitamin C + Zinc Effervescent Tablets</h2>
<p>BRENTIS Vitamin C + Zinc Effervescent Tablets are part of the wellness product range offered by Brentis Healthcare.</p>
<p>The product provides an effervescent format for adults interested in supplementing Vitamin C and zinc.</p>
<p>Before use, review the product label for:</p>
<ul><li>The amount of Vitamin C and zinc per serving.</li><li>The recommended daily intake.</li><li>The complete ingredient list.</li><li>Directions for preparation and consumption.</li><li>Relevant precautions and safety information.</li></ul>
<p>Use the product only as directed.</p>
<h2>Frequently Asked Questions</h2>
<h3>Can Vitamin C and zinc be taken together?</h3>
<p>They are commonly combined in supplements. However, the appropriate amounts depend on the formulation, dietary intake and individual circumstances.</p>
<h3>Does Vitamin C + Zinc prevent infections?</h3>
<p>No supplement can guarantee protection against infections. Vitamin C and zinc contribute to normal immune system function, but this should not be confused with disease prevention or treatment.</p>
<h3>Are effervescent tablets suitable for everyone?</h3>
<p>Not necessarily. Suitability depends on the formulation and individual health circumstances. Review the label and consult a healthcare professional if you have concerns.</p>
<h3>Can I take Vitamin C and zinc every day?</h3>
<p>Follow the product's recommended daily intake. Avoid combining multiple supplements without checking their total nutrient content.</p>
<h2>Final Thoughts</h2>
<p>Vitamin C and zinc are essential nutrients that support several normal physiological functions.</p>
<p>A varied diet remains the foundation of good nutrition. Supplements may be useful in certain circumstances, but they should be selected according to individual needs and used responsibly.</p>
<p>BRENTIS — Supporting informed choices in everyday wellness.</p>
<blockquote><em>Medical disclaimer: This article is intended for general educational purposes only and does not constitute medical advice. Nutritional supplements are not intended to diagnose, treat, cure or prevent disease. Consult a qualified healthcare professional before use if you have an existing medical condition, take medication, or are pregnant or breastfeeding.</em></blockquote>`,
    coverImageUrl: 'https://images.unsplash.com/photo-1757332914599-3c46adc7ea4b?w=900&q=80',
    metaTitle: 'Vitamin C and Zinc Effervescent Tablets: Benefits and Uses | BRENTIS',
    metaDescription: 'Learn about Vitamin C and zinc, their nutritional functions, the advantages of effervescent supplements and how to use them responsibly.',
    tags: ['Supplements'],
  },
  {
    title: 'Glutathione + Vitamin C Effervescent Tablets: Understanding Antioxidants and Cellular Health',
    slug: 'glutathione-vitamin-c-effervescent-tablets',
    excerpt: 'Discover what glutathione and Vitamin C do in the body, explore the science behind antioxidant supplements and understand responsible use.',
    content: `<p>Antioxidants are compounds that help protect cells from oxidative damage.</p>
<p>Two substances frequently discussed in the wellness industry are glutathione and Vitamin C. Both play roles in the body's antioxidant systems, although they have different structures and functions.</p>
<p>Glutathione is produced naturally by the body, while Vitamin C is an essential nutrient that must be obtained through the diet.</p>
<p>Supplements combining these ingredients are available in different formats, including effervescent tablets.</p>
<p>BRENTIS Glutathione + Vitamin C Effervescent Tablets are part of the wellness range offered by Brentis Healthcare. This guide explores the science behind these ingredients, their nutritional relevance and the considerations surrounding supplementation.</p>
<h2>What Is Glutathione?</h2>
<p>Glutathione is a compound naturally produced by the body.</p>
<p>It is made from three amino acids:</p>
<ul><li>Glutamate.</li><li>Cysteine.</li><li>Glycine.</li></ul>
<p>Glutathione is present in many tissues and plays an important role in cellular processes.</p>
<p>One of its functions is to participate in the body's antioxidant defence system.</p>
<h2>What Does Glutathione Do?</h2>
<p>Glutathione is involved in several biological processes, including:</p>
<ul><li>Protection against oxidative stress.</li><li>Cellular antioxidant activity.</li><li>Maintenance of the body's redox balance.</li><li>Certain processes involved in the metabolism of compounds.</li></ul>
<p>The body produces and regulates glutathione naturally.</p>
<p>Its levels can be influenced by several factors, including nutritional status, age and physiological conditions.</p>
<p>However, the relationship between glutathione levels and specific health outcomes is complex.</p>
<h2>What Is Vitamin C?</h2>
<p>Vitamin C, also known as ascorbic acid, is an essential water-soluble vitamin.</p>
<p>It contributes to several normal physiological functions, including collagen formation, immune system function and protection of cells from oxidative stress.</p>
<p>Vitamin C is found in foods such as citrus fruits, guava, amla, tomatoes and capsicum.</p>
<h2>Why Are Glutathione and Vitamin C Combined?</h2>
<p>Glutathione and Vitamin C are both involved in antioxidant processes.</p>
<p>Vitamin C contributes to the protection of cells from oxidative stress, while glutathione participates in the body's cellular antioxidant systems.</p>
<p>Their combination is therefore of interest in nutritional supplement formulations.</p>
<p>However, the presence of two antioxidant ingredients does not establish that a particular supplement will produce a specific health outcome.</p>
<p>The effects of a supplement depend on its formulation, dosage, absorption and individual circumstances.</p>
<h2>Glutathione Supplements and Skin Health</h2>
<p>Glutathione is frequently discussed in relation to skin appearance and pigmentation.</p>
<p>Some studies have investigated whether oral glutathione supplementation may influence skin pigmentation.</p>
<p>However, the available evidence remains limited, and research findings are not sufficient to establish oral glutathione as a reliable or sustained skin-lightening treatment.</p>
<p>It should not be promoted as a guaranteed method of changing natural skin colour or treating pigmentation disorders.</p>
<p>Skin pigmentation is influenced by several factors, including genetics, sun exposure and underlying skin conditions.</p>
<p>People concerned about pigmentation or other skin issues should seek advice from a qualified dermatologist.</p>
<h2>What Are Effervescent Tablets?</h2>
<p>Effervescent tablets dissolve in water before consumption.</p>
<p>This creates a fizzy beverage that may be convenient for adults who prefer a drinkable supplement.</p>
<p>The effervescent format does not automatically improve the effectiveness of glutathione or Vitamin C.</p>
<p>The actual nutritional composition depends on the quantity of each ingredient and the complete formulation.</p>
<h2>How to Choose a Glutathione + Vitamin C Supplement</h2>
<p>Before selecting a supplement, review the following:</p>
<ul><li>The amount of glutathione per serving.</li><li>The amount of Vitamin C per serving.</li><li>The form of glutathione used.</li><li>Additional ingredients and sweeteners.</li><li>Recommended daily intake.</li><li>Product quality and manufacturing information.</li><li>Safety precautions and relevant warnings.</li></ul>
<p>Avoid relying solely on marketing terms such as &quot;advanced,&quot; &quot;premium&quot; or &quot;high absorption&quot; without supporting information.</p>
<h2>Is Glutathione Supplementation Suitable for Everyone?</h2>
<p>Not necessarily.</p>
<p>The safety and suitability of a glutathione supplement depend on its formulation, dosage and individual health circumstances.</p>
<p>People who are pregnant, breastfeeding, taking medication or managing an existing medical condition should consult a healthcare professional before use.</p>
<p>Supplements should not be used as a substitute for medical treatment or professional advice.</p>
<h2>BRENTIS Glutathione + Vitamin C Effervescent Tablets</h2>
<p>BRENTIS Glutathione + Vitamin C Effervescent Tablets are part of the wellness range offered by Brentis Healthcare.</p>
<p>The product combines glutathione and Vitamin C in an effervescent format.</p>
<p>Consumers should review the product's complete ingredient list, serving information, directions and safety precautions before use.</p>
<p>The product should not be considered a treatment for skin pigmentation, a substitute for medical care or a guaranteed method of achieving a particular cosmetic result.</p>
<h2>Frequently Asked Questions</h2>
<h3>Does glutathione improve skin colour?</h3>
<p>Evidence supporting oral glutathione as a reliable and sustained skin-lightening treatment remains limited. Results are not guaranteed, and the supplement should not be presented as a treatment for pigmentation disorders.</p>
<h3>Is glutathione naturally present in the body?</h3>
<p>Yes. Glutathione is produced naturally by the body and participates in several cellular processes, including antioxidant defence.</p>
<h3>Can I take glutathione with Vitamin C?</h3>
<p>These ingredients are commonly combined in supplements. However, the appropriate formulation and dosage depend on individual circumstances.</p>
<h3>Are glutathione supplements a replacement for skincare?</h3>
<p>No. Supplements do not replace sun protection, appropriate skincare or professional treatment for skin conditions.</p>
<h2>Final Thoughts</h2>
<p>Glutathione and Vitamin C are important components of the body's antioxidant systems.</p>
<p>Understanding their functions, the available evidence and the limitations of supplementation can help consumers make more informed decisions.</p>
<p>A balanced diet, appropriate skincare and responsible supplement use remain important parts of everyday wellness.</p>
<p>BRENTIS — Wellness begins with informed choices.</p>
<blockquote><em>Medical disclaimer: This article is for general educational purposes only and does not constitute medical advice. Glutathione and Vitamin C supplements are not intended to diagnose, treat, cure or prevent disease. Consult a qualified healthcare professional before use if you have an existing medical condition, take medication, or are pregnant or breastfeeding.</em></blockquote>`,
    coverImageUrl: 'https://images.unsplash.com/photo-1523467059949-96484ae8e776?w=900&q=80',
    metaTitle: 'Glutathione and Vitamin C Supplements: Benefits and Safety | BRENTIS',
    metaDescription: 'Discover what glutathione and Vitamin C do in the body, explore the science behind antioxidant supplements and understand responsible use.',
    tags: ['Supplements'],
  },
  {
    title: 'Sea Buckthorn Juice: Exploring the Nutrition and Potential of This Unique Fruit',
    slug: 'sea-buckthorn-juice-benefits',
    excerpt: 'Explore sea buckthorn juice, its nutritional composition, potential benefits and how to choose a quality fruit-based beverage.',
    content: `<p>Sea buckthorn is a plant known for its small, orange-coloured berries.</p>
<p>These berries have attracted interest because of their nutritional composition, including naturally occurring vitamins, carotenoids and other plant compounds.</p>
<p>Sea buckthorn is available in several forms, including juice, pulp, oil and extracts.</p>
<p>Among these, juice offers a convenient way to explore the fruit as part of a varied diet.</p>
<p>BRENTIS Sea Buckthorn Juice is part of the wellness product range offered by Brentis Healthcare. This guide explains what sea buckthorn is, what its berries contain and how to make informed choices when selecting a sea buckthorn beverage.</p>
<h2>What Is Sea Buckthorn?</h2>
<p>Sea buckthorn belongs to the genus Hippophae.</p>
<p>It grows in several regions of Europe and Asia and is recognised for its orange berries.</p>
<p>The fruit has a distinctive tart taste and is used in different food products, including juices, jams, sauces and other fruit preparations.</p>
<p>Sea buckthorn has also been studied for its nutritional composition and potential physiological effects.</p>
<p>However, research involving isolated extracts or laboratory studies does not automatically establish the benefits of consuming sea buckthorn juice.</p>
<h2>What Nutrients Are Found in Sea Buckthorn?</h2>
<p>Sea buckthorn berries contain a variety of naturally occurring compounds.</p>
<p>Their nutritional composition can vary depending on the plant variety, growing conditions, maturity and processing method.</p>
<h2>Vitamin C</h2>
<p>Some sea buckthorn varieties contain Vitamin C.</p>
<p>Vitamin C contributes to normal immune system function, normal collagen formation and the protection of cells from oxidative stress.</p>
<p>However, the actual Vitamin C content of a commercial juice depends on its formulation and processing.</p>
<p>Consumers should refer to the product's nutritional information rather than assuming that every sea buckthorn beverage provides the same amount.</p>
<h2>Carotenoids</h2>
<p>Sea buckthorn berries contain carotenoids, which are plant pigments responsible for their characteristic orange colour.</p>
<p>Some carotenoids can be converted into Vitamin A in the body, depending on the specific compound.</p>
<p>However, the presence of carotenoids in a fruit does not establish that a particular juice will produce a specific health outcome.</p>
<h2>Polyphenols</h2>
<p>Sea buckthorn contains various polyphenols and other plant-derived compounds.</p>
<p>These substances have been investigated for their antioxidant properties.</p>
<p>However, laboratory findings do not establish that drinking sea buckthorn juice will prevent or treat disease.</p>
<h2>Potential Benefits of Sea Buckthorn: What Does Research Say?</h2>
<p>Sea buckthorn has been investigated for several potential physiological effects.</p>
<p>Research has explored its nutritional composition and possible relationships with metabolic health, skin health and other areas.</p>
<p>However, the evidence varies depending on the specific ingredient, formulation and study design.</p>
<p>Many findings come from laboratory research or small preliminary studies.</p>
<p>These findings should not be interpreted as proof that drinking sea buckthorn juice will prevent or treat a medical condition.</p>
<h2>Sea Buckthorn and Everyday Nutrition</h2>
<p>Fruit-based beverages can contribute to dietary variety.</p>
<p>Sea buckthorn juice may provide an opportunity to explore a fruit with a distinctive nutritional composition.</p>
<p>However, juice is not necessarily nutritionally equivalent to whole fruit.</p>
<p>Whole fruits generally provide fibre that may be reduced or absent in juice.</p>
<h2>Sea Buckthorn and Antioxidant Compounds</h2>
<p>Sea buckthorn contains several plant compounds that have been studied for antioxidant activity.</p>
<p>However, antioxidant activity observed in laboratory settings does not necessarily translate into a measurable health benefit from consuming a particular beverage.</p>
<p>The amount consumed, formulation and individual nutritional status all matter.</p>
<h2>How to Choose Sea Buckthorn Juice</h2>
<p>When selecting a sea buckthorn beverage, consider the following:</p>
<ul><li>Fruit content: Check the percentage of sea buckthorn juice or pulp.</li><li>Added ingredients: Review sugars, sweeteners, flavouring agents and other components.</li><li>Serving size: Understand how much you are consuming.</li><li>Nutritional information: Check the declared nutrient content.</li><li>Storage instructions: Follow the directions provided on the label.</li><li>Product quality: Look for clear sourcing, manufacturing and quality information.</li></ul>
<p>The term &quot;sea buckthorn juice&quot; alone does not establish its nutritional composition.</p>
<h2>Is Sea Buckthorn Juice Suitable for Everyone?</h2>
<p>Sea buckthorn juice may not be suitable for everyone.</p>
<p>People with allergies or sensitivities to the ingredients should avoid the product.</p>
<p>Those with existing medical conditions, taking medication or following a medically prescribed diet should consult a healthcare professional before introducing a new supplement or concentrated fruit product.</p>
<p>Pregnant or breastfeeding individuals should seek professional advice before use if the product is marketed as a supplement or contains concentrated ingredients.</p>
<h2>BRENTIS Sea Buckthorn Juice</h2>
<p>BRENTIS Sea Buckthorn Juice is part of the wellness range offered by Brentis Healthcare.</p>
<p>The product provides a fruit-based option for adults interested in exploring sea buckthorn as part of their dietary routine.</p>
<p>Before use, review the product label for its fruit content, ingredients, serving size, nutritional information and storage instructions.</p>
<p>The product should not be considered a treatment for any disease or a replacement for a balanced diet.</p>
<h2>Frequently Asked Questions</h2>
<h3>What does sea buckthorn juice taste like?</h3>
<p>Sea buckthorn berries are known for their tart, distinctive flavour. The taste of a commercial juice depends on its formulation and any additional ingredients.</p>
<h3>Is sea buckthorn juice a source of Vitamin C?</h3>
<p>Sea buckthorn berries can contain Vitamin C, but the amount in a commercial juice depends on the variety, processing and formulation. Check the nutritional information on the product label.</p>
<h3>Can sea buckthorn juice replace whole fruit?</h3>
<p>No. Juice may contribute to dietary variety, but whole fruit generally provides fibre and a different eating experience.</p>
<h3>Can sea buckthorn juice treat skin conditions?</h3>
<p>There is insufficient evidence to establish sea buckthorn juice as a treatment for skin conditions. Consult a qualified healthcare professional for persistent skin concerns.</p>
<h2>Final Thoughts</h2>
<p>Sea buckthorn is a distinctive fruit with an interesting nutritional composition.</p>
<p>Understanding its ingredients, potential uses and limitations can help consumers make informed choices.</p>
<p>Whether consumed as juice or incorporated into other foods, sea buckthorn can be explored as part of a varied and balanced diet.</p>
<p>BRENTIS — Exploring everyday wellness through informed choices.</p>
<blockquote><em>Medical disclaimer: This article is for general educational purposes only and does not constitute medical advice. Sea buckthorn juice is not intended to diagnose, treat, cure or prevent disease. Consult a qualified healthcare professional before use if you have an existing medical condition, take medication, or are pregnant or breastfeeding.</em></blockquote>`,
    coverImageUrl: 'https://images.unsplash.com/photo-1758614030639-980dc3f46c4f?w=900&q=80',
    metaTitle: 'Sea Buckthorn Juice: Nutrition, Potential Benefits and Uses | BRENTIS',
    metaDescription: 'Explore sea buckthorn juice, its nutritional composition, potential benefits and how to choose a quality fruit-based beverage.',
    tags: ['Nutrition'],
  },
  {
    title: 'Shilajit Resin: Understanding Its Traditional Use, Potential Benefits and Safety',
    slug: 'shilajit-resin-benefits-and-safety',
    excerpt: 'Learn what Shilajit Resin is, explore the available scientific evidence, understand quality considerations and discover how to use it responsibly.',
    content: `<p>Shilajit is a naturally occurring substance found in mountainous regions.</p>
<p>It has a long history of use in traditional systems of medicine and is now available in different supplement formats, including resin, capsules and powders.</p>
<p>Shilajit has attracted interest because of its complex composition and the presence of compounds such as fulvic acid.</p>
<p>However, understanding its traditional use, the available scientific evidence and the importance of product quality is essential before considering supplementation.</p>
<p>BRENTIS Shilajit Resin is part of the wellness range offered by Brentis Healthcare. This guide explores Shilajit, its composition, potential physiological effects and the considerations surrounding responsible use.</p>
<h2>What Is Shilajit?</h2>
<p>Shilajit is a naturally occurring substance that develops over long periods through the transformation of organic material.</p>
<p>It is commonly found in mountainous regions, including parts of the Himalayas.</p>
<p>The substance is typically dark brown or black and may have a sticky, resin-like consistency.</p>
<p>Its composition can vary depending on geographical origin, environmental conditions and processing methods.</p>
<p>Shilajit has been used in traditional systems of medicine, but traditional use alone does not establish the effectiveness of a product for a specific health condition.</p>
<h2>What Is Shilajit Resin?</h2>
<p>Shilajit Resin is a resin-like preparation of Shilajit.</p>
<p>The term &quot;resin&quot; describes the physical form of the product rather than a guarantee of purity, concentration or effectiveness.</p>
<p>Different Shilajit products may contain varying amounts of naturally occurring compounds.</p>
<p>The nutritional and chemical composition depends on the source material and manufacturing process.</p>
<p>Consumers should therefore review the product's ingredient information and quality documentation rather than assuming that all Shilajit resins are equivalent.</p>
<h2>What Compounds Are Found in Shilajit?</h2>
<p>Shilajit contains a complex mixture of organic and mineral components.</p>
<p>Some commonly discussed compounds include:</p>
<h2>Fulvic Acid</h2>
<p>Fulvic acid is a group of organic compounds associated with the breakdown and transformation of organic material.</p>
<p>It is frequently discussed in relation to Shilajit's composition.</p>
<p>However, the presence of fulvic acid does not automatically establish that a Shilajit product provides a particular health benefit.</p>
<h2>Other Organic Compounds</h2>
<p>Shilajit contains various organic substances, including compounds derived from plant material.</p>
<p>Their amounts and characteristics can vary considerably between products.</p>
<h2>Mineral Components</h2>
<p>Shilajit may contain minerals and other inorganic substances.</p>
<p>The mineral composition depends on the source and processing method.</p>
<p>The presence of minerals does not mean that every Shilajit product provides nutritionally significant amounts of essential minerals.</p>
<h2>Potential Benefits of Shilajit: What Does Research Say?</h2>
<p>Shilajit has been investigated for several potential physiological effects.</p>
<p>Some studies have explored its relationship with energy metabolism, physical performance and other areas.</p>
<p>However, research involving Shilajit remains limited, and many studies have important limitations, including small sample sizes and differences in product composition.</p>
<p>Findings from one preparation cannot automatically be applied to every Shilajit supplement.</p>
<h2>Shilajit and Energy</h2>
<p>Shilajit is frequently marketed for energy and vitality.</p>
<p>However, there is insufficient high-quality evidence to establish that Shilajit Resin reliably improves energy levels in the general population.</p>
<p>Persistent fatigue can have several underlying causes, including sleep problems, nutritional deficiencies and medical conditions.</p>
<p>People experiencing ongoing fatigue should seek professional medical advice rather than relying on supplements alone.</p>
<h2>Shilajit and Physical Performance</h2>
<p>Some preliminary research has investigated Shilajit in relation to physical performance.</p>
<p>However, the available evidence is not sufficient to establish Shilajit as a proven performance-enhancing supplement.</p>
<p>It should not be presented as a substitute for appropriate nutrition, training, rest or medical advice.</p>
<h2>Shilajit and Men's Health</h2>
<p>Shilajit is sometimes marketed for male vitality and reproductive health.</p>
<p>Although some preliminary studies have explored these areas, the evidence remains limited.</p>
<p>Shilajit should not be presented as a proven treatment for infertility, erectile dysfunction, low testosterone or other medical conditions.</p>
<p>People experiencing reproductive or sexual health concerns should consult a qualified healthcare professional.</p>
<h2>Why Is Shilajit Quality Important?</h2>
<p>Shilajit is a naturally sourced material, and its composition can vary.</p>
<p>Unprocessed or inadequately purified Shilajit may contain unwanted contaminants, including heavy metals.</p>
<p>For this reason, product quality and manufacturing controls are particularly important.</p>
<p>Before purchasing a Shilajit supplement, consider:</p>
<ul><li>Source information: Look for clear information about the origin of the material.</li><li>Purification process: Check whether the manufacturer provides details about processing and purification.</li><li>Quality testing: Look for appropriate testing information, including contaminant testing.</li><li>Ingredient composition: Review the declared ingredients and quantities.</li><li>Recommended usage: Follow the product's directions.</li><li>Safety precautions: Review warnings and suitability information.</li></ul>
<p>A product's appearance, texture or marketing description cannot independently establish its purity or safety.</p>
<h2>How to Use Shilajit Responsibly</h2>
<p>Shilajit supplements should be used only according to the product's directions.</p>
<p>Do not increase the serving size in an attempt to achieve faster results.</p>
<p>People who are pregnant, breastfeeding, taking medication or managing an existing medical condition should consult a qualified healthcare professional before use.</p>
<p>If a product causes an unexpected reaction, discontinue use and seek appropriate medical advice.</p>
<h2>BRENTIS Shilajit Resin</h2>
<p>BRENTIS Shilajit Resin is part of the wellness range offered by Brentis Healthcare.</p>
<p>The product provides a resin-based format for adults interested in exploring Shilajit as part of their wellness routine.</p>
<p>Before use, review the product label for its ingredient composition, recommended serving, directions, quality information and safety precautions.</p>
<p>The product should not be considered a treatment for fatigue, reproductive conditions or other medical disorders.</p>
<h2>Frequently Asked Questions</h2>
<h3>What is Shilajit Resin?</h3>
<p>Shilajit Resin is a resin-like preparation of a naturally occurring substance found in mountainous regions. Its composition varies depending on the source and processing method.</p>
<h3>Does Shilajit increase energy?</h3>
<p>Shilajit is marketed for energy and vitality, but evidence supporting these effects in humans remains limited. It should not be considered a proven treatment for fatigue.</p>
<h3>Is Shilajit safe for everyone?</h3>
<p>No. Safety depends on the product's composition, quality and the individual's health circumstances. Consult a healthcare professional before use if you have an existing medical condition or take medication.</p>
<h3>Why is purification important?</h3>
<p>Unprocessed or inadequately purified Shilajit may contain contaminants, including heavy metals. Appropriate quality controls and testing are important considerations when selecting a product.</p>
<h3>Can Shilajit treat infertility or low testosterone?</h3>
<p>There is insufficient evidence to establish Shilajit as a reliable treatment for infertility, low testosterone or other reproductive health conditions. Consult a qualified healthcare professional for diagnosis and treatment.</p>
<h2>Final Thoughts</h2>
<p>Shilajit is a traditional ingredient that has attracted modern scientific interest.</p>
<p>However, understanding its composition, the limitations of available evidence and the importance of product quality is essential before considering supplementation.</p>
<p>Choose products that provide clear ingredient information, responsible usage directions and appropriate quality documentation.</p>
<p>BRENTIS — Wellness begins with informed choices.</p>
<blockquote><em>Medical disclaimer: This article is for general educational purposes only and does not constitute medical advice. Shilajit Resin is not intended to diagnose, treat, cure or prevent disease. Consult a qualified healthcare professional before use if you have an existing medical condition, take medication, or are pregnant or breastfeeding.</em></blockquote>`,
    coverImageUrl: 'https://images.unsplash.com/photo-1637846959991-18e54d6e2035?w=900&q=80',
    metaTitle: 'Shilajit Resin: Benefits, Uses, Quality and Safety | BRENTIS',
    metaDescription: 'Learn what Shilajit Resin is, explore the available scientific evidence, understand quality considerations and discover how to use it responsibly.',
    tags: ['Supplements'],
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
  placement: 'hero' | 'category' | 'checkout' | 'offer';
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
      placement: 'offer',
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
      placement: 'offer',
      order: 2,
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
      placement: 'offer',
      order: 3,
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
  // The original seed used a handful of generic one-line placeholder posts
  // (title + excerpt duplicated into "content", no real article body). Those
  // are superseded by the real, full-length product articles in `BLOGS`
  // (sourced from BLOGS.docx) — removed by their old fixed slugs so the
  // storefront never shows both the placeholder and the real version of the
  // same topic.
  const OLD_PLACEHOLDER_BLOG_SLUGS = [
    'everyday-vitamin-nutrition-guide',
    'understanding-common-cold-symptoms',
    'building-healthy-lifestyle-habits',
    'medication-safety-basics-at-home',
    'preventive-care-for-a-healthier-life',
  ];
  await BlogModel.deleteMany({ slug: { $in: OLD_PLACEHOLDER_BLOG_SLUGS } });

  const blogCounts = track('blogs');
  for (const b of BLOGS) {
    const existing = await BlogModel.findOne({ slug: b.slug });
    if (!existing) {
      await BlogModel.create({
        title: b.title,
        slug: b.slug,
        excerpt: b.excerpt,
        content: b.content,
        coverImageUrl: b.coverImageUrl,
        authorId: adminId,
        tags: b.tags,
        isPublished: true,
        seo: { metaTitle: b.metaTitle, metaDescription: b.metaDescription },
        createdBy: adminId,
      });
      bump(blogCounts, true);
    } else {
      bump(blogCounts, false);
    }
  }

  // --- Banners ------------------------------------------------------------
  // These 3 banners were originally seeded under `placement: 'category'`
  // (OffersPage.tsx used to borrow that placement for lack of a dedicated
  // one) and are now re-seeded under the real `placement: 'offer'` instead.
  // Remove the old `category`-placement copies by title so re-running this
  // migration doesn't leave orphaned duplicates sitting unused in the DB.
  await BannerModel.deleteMany({
    placement: 'category',
    title: {
      $in: [
        'Flat 20% Off Diabetes Care Essentials',
        '15% Off Your First Order',
        'Allergy & Cold Relief Bundle Deals',
      ],
    },
  });

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
