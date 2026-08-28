import { ROLES } from '@medcommerce/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/models/user.model';
import { BrandModel } from '../modules/catalog/models/brand.model';
import { CategoryModel } from '../modules/catalog/models/category.model';
import { ManufacturerModel } from '../modules/catalog/models/manufacturer.model';
import { ProductModel } from '../modules/catalog/models/product.model';
import { BannerModel } from '../modules/cms/models/banner.model';
import { BlogModel } from '../modules/cms/models/blog.model';
import { BatchModel } from '../modules/inventory/models/batch.model';
import { WarehouseModel } from '../modules/inventory/models/warehouse.model';
import { SellerModel } from '../modules/sellers/models/seller.model';

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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930072/products/ro5rzcpwpltvrcbw5ngf.jpg',
    imagePublicId: 'products/ro5rzcpwpltvrcbw5ngf',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930296/products/k2rnetjit5vknewrszsz.jpg',
    imagePublicId: 'products/k2rnetjit5vknewrszsz',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930299/products/d0ixyy16vrpdyeynsbc1.jpg',
    imagePublicId: 'products/d0ixyy16vrpdyeynsbc1',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930301/products/lll4b5wjvpdadajxqdab.jpg',
    imagePublicId: 'products/lll4b5wjvpdadajxqdab',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930303/products/ud8c4zyzzmznwljwouel.jpg',
    imagePublicId: 'products/ud8c4zyzzmznwljwouel',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930306/products/pbhm7605evxfnc7pozrm.jpg',
    imagePublicId: 'products/pbhm7605evxfnc7pozrm',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930308/products/lkzzwinlrvw1tryh5bbp.jpg',
    imagePublicId: 'products/lkzzwinlrvw1tryh5bbp',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930311/products/npbgnuvwcyosew4njzx6.jpg',
    imagePublicId: 'products/npbgnuvwcyosew4njzx6',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930313/products/oztjjpm7usf8jyqlperb.jpg',
    imagePublicId: 'products/oztjjpm7usf8jyqlperb',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930315/products/xwiehtysodjhgfsybwer.jpg',
    imagePublicId: 'products/xwiehtysodjhgfsybwer',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930317/products/otgevfr5yoeuqilsxuph.jpg',
    imagePublicId: 'products/otgevfr5yoeuqilsxuph',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930320/products/zvohpfk8tppgkaoigjzq.jpg',
    imagePublicId: 'products/zvohpfk8tppgkaoigjzq',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930322/products/ahy3boetiydnhkm4mxik.jpg',
    imagePublicId: 'products/ahy3boetiydnhkm4mxik',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930325/products/tkzlvl7gox5mxjpbt2ns.jpg',
    imagePublicId: 'products/tkzlvl7gox5mxjpbt2ns',
    batch: { quantity: 150, unitCost: 287, expiryDate: '2028-01-01' },
  },
];

const BLOGS = [
  {
    title: 'Everyday Vitamin & Nutrition Guide',
    slug: 'everyday-vitamin-nutrition-guide',
    excerpt:
      'A practical guide to the vitamins and minerals your body needs every day, and simple ways to get enough of them through diet and supplements.',
    coverImageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930405/blog/kgfjftmochanco7i3iqt.jpg',
    tags: ['Wellness'],
  },
  {
    title: 'Understanding Common Cold Symptoms',
    slug: 'understanding-common-cold-symptoms',
    excerpt:
      "Cold season is here — learn to recognize common symptoms, when home care is enough, and when it's time to see a doctor.",
    coverImageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930407/blog/sc6j1kd09sflivk5mfrc.jpg',
    tags: ['Healthcare Tips'],
  },
  {
    title: 'Building Healthy Lifestyle Habits',
    slug: 'building-healthy-lifestyle-habits',
    excerpt:
      "Small, consistent changes in diet, movement, and sleep can add up to lasting health improvements. Here's where to start.",
    coverImageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930409/blog/ppif7y9wm3r4pkzzrmx9.jpg',
    tags: ['Lifestyle'],
  },
  {
    title: 'Medication Safety Basics at Home',
    slug: 'medication-safety-basics-at-home',
    excerpt:
      "Simple habits — proper storage, checking expiry dates, and avoiding self-medication — that keep your household's medicine cabinet safe.",
    coverImageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930411/blog/y9cdqomuigfqkeoltwbs.jpg',
    tags: ['Medicine Guide'],
  },
  {
    title: 'Preventive Care for a Healthier Life',
    slug: 'preventive-care-for-a-healthier-life',
    excerpt:
      "Preventive checkups and screenings catch issues early. Here's a general overview of preventive care worth prioritizing.",
    coverImageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930413/blog/jre8rlqhputeoj051m8m.jpg',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930416/banners/iufntj28btbo1uaaridr.jpg',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930418/banners/dvbekq5yklj0wnybwdlc.jpg',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930420/banners/d5kwjurvvdhkehsrxozn.jpg',
    imagePublicId: null,
    linkPath: '/products',
    linkCategorySlug: 'diabetes-care',
    ctaText: 'Shop Diabetes Care',
    placement: 'category',
    order: 1,
  },
  {
    title: '15% Off Your First Order',
    subtitle: 'New to KarienLabs? Start with savings on your first purchase.',
    badge: 'New Customer Offer',
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930422/banners/yeaf7mazsukiyexaqmtk.jpg',
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
    imageUrl: 'https://res.cloudinary.com/dqdbmfdlt/image/upload/v1787930424/banners/nfdvfusibdibn8uhvccy.jpg',
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
