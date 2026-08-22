import { CATALOG_AUDIT_ACTIONS, SEO_AUDIT_ACTIONS, resolveProductDefaults, type Role } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';
import { ConflictError, NotFoundError, UnprocessableEntityError, ValidationError } from '../../utils/app-error';
import { BulkResultBuilder, type BulkOperationResult } from '../../utils/bulk-result';
import { buildExcelBuffer, parseExcelBuffer } from '../../utils/excel.util';
import type { ListQuery } from '../../utils/pagination';
import { slugify } from '../../utils/slugify';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getSeoConfig, resolveCanonicalBase } from '../search/seo-config.service';
import { buildFaqStructuredData, buildProductStructuredData } from '../search/structured-data.util';

import { resolveProductAvailability } from './bundle.service';
import { getCatalogConfig } from './catalog-config.service';
import { BrandModel } from './models/brand.model';
import { CategoryModel } from './models/category.model';
import { ManufacturerModel } from './models/manufacturer.model';
import { productRepository } from './product.repository';

interface CreateProductInput {
  name: string;
  slug?: string;
  sku: string;
  categoryId: string;
  basePrice: number;
  mrp: number;
  barcode?: string | null;
  [key: string]: unknown;
}

/** Empty string / whitespace-only barcode is treated as "no barcode" (not a value the uniqueness check runs against) — matches the field's `.trim()`-then-optional validator. `null` is the canonical "no barcode" stored value, never `''`, so the partial unique index (barcode: { $type: 'string' }) never sees an empty string competing for uniqueness. */
function normalizeBarcode(barcode: string | null | undefined): string | null {
  const trimmed = barcode?.trim();
  return trimmed ? trimmed : null;
}

async function assertBarcodeAvailable(barcode: string, excludeProductId?: string): Promise<void> {
  const existing = await productRepository.findByBarcode(barcode);
  if (existing && String((existing as { _id: unknown })._id) !== excludeProductId) {
    throw new ConflictError(`A product with barcode "${barcode}" already exists`);
  }
}

export async function createProduct(input: CreateProductInput, actorId: string) {
  const slug = slugify(input.slug ?? input.name);
  const sku = input.sku.toUpperCase();
  const barcode = normalizeBarcode(input.barcode);

  if (await productRepository.findBySlug(slug))
    throw new ConflictError(`Product slug "${slug}" already exists`);
  if (await productRepository.findBySku(sku))
    throw new ConflictError(`Product SKU "${sku}" already exists`);
  if (barcode) await assertBarcodeAvailable(barcode);

  return productRepository.create({ ...input, slug, sku, barcode, createdBy: actorId });
}

export async function updateProduct(
  id: string,
  input: Partial<CreateProductInput>,
  actorId: string,
  actorRole?: Role,
) {
  const before = await productRepository.findById(id);
  if (!before) throw new NotFoundError('Product');

  const patch = { ...input, updatedBy: actorId } as Record<string, unknown>;
  if (input.slug) patch.slug = slugify(input.slug);
  if (input.sku) patch.sku = input.sku.toUpperCase();
  if ('barcode' in input) {
    const barcode = normalizeBarcode(input.barcode);
    if (barcode) await assertBarcodeAvailable(barcode, id);
    patch.barcode = barcode;
  }

  const updated = await productRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Product');

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  // Prompt 30 Part 31 — price/GST/shipping are financially sensitive
  // (they flow directly into what a customer is charged); extended
  // alongside the pre-existing barcode/mrp/isActive audit fields rather
  // than adding a second, parallel audit call for the same update.
  const beforeFinancial = before as { basePrice?: number; gstRate?: number; shippingCharge?: number };
  await recordAudit({
    actorId,
    actorType,
    action: CATALOG_AUDIT_ACTIONS.ADMIN_UPDATED_PRODUCT,
    resource: 'product',
    resourceId: id,
    before: {
      barcode: (before as { barcode?: unknown }).barcode ?? null,
      basePrice: beforeFinancial.basePrice,
      mrp: (before as { mrp?: number }).mrp,
      gstRate: beforeFinancial.gstRate,
      shippingCharge: beforeFinancial.shippingCharge,
      isActive: (before as { isActive?: boolean }).isActive,
    },
    after: {
      barcode: updated.barcode ?? null,
      basePrice: updated.basePrice,
      mrp: updated.mrp,
      gstRate: updated.gstRate,
      shippingCharge: updated.shippingCharge,
      isActive: updated.isActive,
    },
  });

  // Prompt 23 Part 18/40/41 — a DISTINCT, specifically-named audit record
  // whenever SEO/AEO content changes, so an admin reviewing the audit trail
  // can filter "who changed this product's SEO metadata" without having to
  // diff the generic ADMIN_UPDATED_PRODUCT record's full before/after every
  // time (which deliberately only carries barcode/mrp/isActive, not SEO).
  if ('seo' in input || 'faq' in input) {
    await recordAudit({
      actorId,
      actorType,
      action: SEO_AUDIT_ACTIONS.PRODUCT_SEO_UPDATED,
      resource: 'product_seo',
      resourceId: id,
      before: { seo: (before as { seo?: unknown }).seo, faq: (before as { faq?: unknown }).faq },
      after: { seo: updated.seo, faq: updated.faq },
    });
  }

  return updated;
}

export async function deleteProduct(id: string, actorId: string) {
  const deleted = await productRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Product');
}

export async function getProductById(id: string) {
  const product = await productRepository.findById(id);
  if (!product) throw new NotFoundError('Product');
  return product;
}

/**
 * Customer-facing product detail — adds brand/manufacturer names and a computed
 * `inStock` flag on top of the raw document. Deliberately separate from
 * `getProductById` (reused internally by the image-mutation services above,
 * which only need `images` and shouldn't pay for two extra lookups + a stock
 * aggregation on every write).
 *
 * Prompt 23 Part 14/21 — accepts EITHER the raw `_id` (every pre-existing
 * bookmark/internal link keeps working, zero regression) OR the SEO-friendly
 * `slug` (what new storefront links use going forward) via
 * `findByIdOrSlug`.
 */
export async function getPublicProductDetail(idOrSlug: string) {
  const product = await productRepository.findByIdOrSlug(idOrSlug);
  if (!product) throw new NotFoundError('Product');

  const [brand, manufacturer, category, stockMap, seoConfig] = await Promise.all([
    product.brandId ? BrandModel.findById(product.brandId).select('name slug').lean() : null,
    product.manufacturerId
      ? ManufacturerModel.findById(product.manufacturerId).select('name slug').lean()
      : null,
    CategoryModel.findById(product.categoryId)
      .select('isExpirableDefault requiresPrescriptionDefault')
      .lean(),
    resolveProductAvailability([String(product._id)]),
    getSeoConfig(),
  ]);

  const inStock = (stockMap.get(String(product._id)) ?? 0) > 0;

  return {
    ...product,
    ...deriveProductImageView(product.images),
    brand: brand ? { _id: brand._id, name: brand.name, slug: brand.slug } : null,
    manufacturer: manufacturer
      ? { _id: manufacturer._id, name: manufacturer.name, slug: manufacturer.slug }
      : null,
    inStock,
    // Category-inherited resolution (CAT-06) — cart/checkout/storefront can
    // read this directly instead of re-fetching the category and
    // re-implementing resolveProductDefaults themselves.
    effective: resolveProductDefaults(product, category),
    // Prompt 23 Part 25/27/28/46/47 — structured data + FAQ, computed from
    // the SAME authoritative price/stock this response already returns
    // (never a second source of truth), gated by Configuration so a Super
    // Admin can turn structured-data markup off platform-wide.
    structuredData:
      seoConfig.seoEnabled && seoConfig.structuredDataEnabled && seoConfig.productSeoEnabled
        ? buildProductStructuredData(
            {
              name: product.name,
              slug: product.slug,
              shortDescription: product.shortDescription,
              description: product.description,
              sku: product.sku,
              images: product.images ?? [],
              basePrice: product.basePrice,
              brandName: brand?.name ?? null,
              inStock,
              ratingAvg: product.ratingAvg,
              ratingCount: product.ratingCount,
            },
            resolveCanonicalBase(seoConfig),
          )
        : null,
    faqStructuredData:
      seoConfig.seoEnabled && seoConfig.aeoEnabled ? buildFaqStructuredData(product.faq ?? []) : null,
  };
}

/**
 * `priceMin`/`priceMax`/`minDiscountPct` are pulled out of the generic equality-match
 * `filter` bag and translated into range/derived-field queries — the storefront's
 * price and discount filters (Prompt 6) need this, since a plain key=value filter
 * can't express "basePrice between X and Y" or "discount >= N%" (discount isn't a
 * stored field, it's derived from mrp vs basePrice at query time via `$expr`).
 *
 * This is the SAME endpoint used by both the admin product table and the
 * customer-facing "All Products" page (no separate admin route exists — see
 * product.routes.ts), so it deliberately does NOT force an `isActive: true`
 * filter here (an admin must be able to see inactive/draft products too).
 *
 * Combo-catalog fix — `inStock` was previously never computed on this
 * endpoint at all (unlike `product-search.service.ts`'s search results,
 * which always did), so a customer browsing "All Products" had no way to
 * tell a zero-stock product apart from an in-stock one, and a combo/bundle
 * SKU had no availability information whatsoever. Enriched the same way
 * search already does: one batched, authoritative lookup for the whole
 * page (never one query per row — Part 43), via the SAME canonical
 * `resolveProductAvailability` bundle.service.ts also uses for product
 * detail and search, so "in stock" can never disagree between surfaces.
 */
export async function listProducts(query: ListQuery) {
  const { priceMin, priceMax, minDiscountPct, ...rest } = query.filter as Record<string, string>;
  const filter: Record<string, unknown> = { ...rest };
  if (query.search) filter.$text = { $search: query.search };

  if (priceMin || priceMax) {
    const range: Record<string, number> = {};
    if (priceMin) range.$gte = Number(priceMin);
    if (priceMax) range.$lte = Number(priceMax);
    filter.basePrice = range;
  }

  if (minDiscountPct) {
    filter.$expr = {
      $gte: [
        {
          $cond: [
            { $gt: ['$mrp', 0] },
            { $multiply: [{ $divide: [{ $subtract: ['$mrp', '$basePrice'] }, '$mrp'] }, 100] },
            0,
          ],
        },
        Number(minDiscountPct),
      ],
    };
  }

  const result = await productRepository.paginate(filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });

  const productIds = result.items.map((item) => String((item as { _id: unknown })._id));
  // Storefront redesign — product cards show the brand name ("Brand if
  // available"), which the list endpoint never resolved before (only the
  // single-product detail endpoint did, via `getPublicProductDetail`
  // above). Batched the SAME way `resolveProductAvailability` already
  // batches stock for this whole page in one query, rather than one
  // `BrandModel.findById` per row.
  const brandIds = [
    ...new Set(
      result.items
        .map((item) => (item as { brandId?: unknown }).brandId)
        .filter((id): id is NonNullable<typeof id> => Boolean(id))
        .map((id) => String(id)),
    ),
  ];
  const [availabilityMap, brands] = await Promise.all([
    resolveProductAvailability(productIds),
    brandIds.length > 0
      ? BrandModel.find({ _id: { $in: brandIds } }).select('name').lean()
      : Promise.resolve([]),
  ]);
  const brandNameById = new Map(brands.map((b) => [String(b._id), b.name]));
  const items = result.items.map((item) => {
    const brandId = (item as { brandId?: unknown }).brandId;
    return {
      ...item,
      ...deriveProductImageView((item as { images?: ProductImage[] }).images),
      inStock: (availabilityMap.get(String((item as { _id: unknown })._id)) ?? 0) > 0,
      brandName: brandId ? (brandNameById.get(String(brandId)) ?? null) : null,
    };
  });

  return { ...result, items };
}

export async function bulkEditProducts(
  ids: string[],
  patch: Record<string, unknown>,
  actorId: string,
) {
  const result = await productRepository.bulkUpdate(ids, { ...patch, updatedBy: actorId });
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

/** Part 4/28 — read-only, available to any authenticated staff member (not gated behind `configuration:read`, which only Super Admin holds — see product.routes.ts) so a plain Admin's Add/Edit Product image UI can enforce the current limit client-side too. */
export async function getProductImageConfig() {
  return getCatalogConfig();
}

export async function bulkDeleteProducts(ids: string[], actorId: string) {
  const result = await productRepository.bulkSoftDelete(ids, actorId);
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

interface ProductImage {
  url: string;
  publicId: string;
  isPrimary: boolean;
  order: number;
}

interface ProductImageRef {
  url: string;
  publicId: string;
}

/**
 * Prompt (Product Image Management) Part 5/6/22 — "conceptually" mainImage +
 * subImages, computed from the SAME `images` array that's always been the
 * single stored source of truth (Part 5: "do not blindly create duplicate
 * image fields"). No schema/migration needed (Part 23): a legacy product
 * with no `isPrimary: true` entry at all falls back to `images[0]` as main —
 * the exact same fallback `ProductCard`/`ProductDetailPage` already used
 * client-side before this change, just moved server-side so every consumer
 * agrees. Sub images are always sorted and renumbered 1..N (Part 6), main is
 * always conceptually `sortOrder: 0`.
 */
function deriveProductImageView(images: ProductImage[] | undefined | null): {
  mainImage: ProductImageRef | null;
  subImages: (ProductImageRef & { sortOrder: number })[];
} {
  const list = images ?? [];
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const main = sorted.find((img) => img.isPrimary) ?? sorted[0] ?? null;
  const subImages = sorted
    .filter((img) => img !== main)
    .map((img, index) => ({ url: img.url, publicId: img.publicId, sortOrder: index + 1 }));

  return {
    mainImage: main ? { url: main.url, publicId: main.publicId } : null,
    subImages,
  };
}

/**
 * Every image-mutation function below returns this (instead of the raw
 * `updateById` Mongoose document) so their response is consistent with
 * `listProducts`/`getPublicProductDetail` (Part 22) — without it, a client
 * reading `response.mainImage` straight off a mutation's result would
 * always get `undefined`, since only the derived-view functions compute it.
 * `.toObject()` converts the Mongoose document to a plain object first, the
 * same shape `.lean()` reads already produce elsewhere in this file.
 */
function withImageView<T extends { images?: ProductImage[]; toObject?: () => Record<string, unknown> }>(
  doc: T,
) {
  const plain = (typeof doc.toObject === 'function' ? doc.toObject() : doc) as Record<string, unknown>;
  return { ...plain, ...deriveProductImageView(doc.images) };
}

/** Sub images always renumbered 1..N contiguously, in their existing relative order (Part 6). */
function renumberSubImages(images: ProductImage[]): ProductImage[] {
  const main = images.find((img) => img.isPrimary) ?? null;
  const subs = images
    .filter((img) => img !== main)
    .sort((a, b) => a.order - b.order)
    .map((img, index) => ({ ...img, isPrimary: false, order: index + 1 }));
  return main ? [{ ...main, isPrimary: true, order: 0 }, ...subs] : subs;
}

/**
 * Prompt (Product Image Management) Part 18/19/20 — the ONLY way to set or
 * replace the main image. Unlike the old `addProductImage({isPrimary:true})`
 * behavior (which just flipped a flag and left the previous main image
 * sitting in the array as an orphaned extra "sub" image, silently eating
 * into the sub-image limit and never touching Cloudinary), this: (1) writes
 * the DB first with the new main image in place, (2) only AFTER that commit
 * succeeds does it delete the OLD main's Cloudinary asset — so a Cloudinary
 * failure or a DB failure can never leave the product without a main image,
 * and a crash between steps 1 and 2 leaves only a harmless orphaned
 * Cloudinary asset (never a broken product reference) — see Part 20's
 * explicit "do not blindly delete the old image before the new state is
 * safely stored" ordering requirement.
 */
export async function setMainProductImage(
  productId: string,
  image: ProductImageRef,
  actorId: string,
) {
  const product = await getProductById(productId);
  const images: ProductImage[] = (product.images ?? []).map((img) => ({ ...img }));
  const previousMain = images.find((img) => img.isPrimary) ?? null;

  const withoutOldMain = images.filter((img) => img.publicId !== previousMain?.publicId);
  const nextImages = renumberSubImages([
    { url: image.url, publicId: image.publicId, isPrimary: true, order: 0 },
    ...withoutOldMain,
  ]);

  const updated = await productRepository.updateById(productId, {
    images: nextImages,
    updatedBy: actorId,
  });

  if (previousMain && previousMain.publicId !== image.publicId) {
    try {
      await destroyAsset(previousMain.publicId);
    } catch (err) {
      logger.error(
        { err, productId, publicId: previousMain.publicId },
        'Failed to delete previous main image Cloudinary asset after replacement',
      );
    }
  }

  return withImageView(updated!);
}

/** Prompt (Product Image Management) Part 4/21/27 — backend-enforced sub-image cap; never trusts the frontend to have already limited the count. */
export async function addSubProductImage(
  productId: string,
  image: ProductImageRef,
  actorId: string,
) {
  const product = await getProductById(productId);
  const images: ProductImage[] = (product.images ?? []).map((img) => ({ ...img }));
  const subCount = images.filter((img) => !img.isPrimary).length;

  const { maxSubImages } = await getCatalogConfig();
  if (subCount >= maxSubImages) {
    throw new UnprocessableEntityError(
      `Maximum of ${maxSubImages} additional images already reached for this product`,
    );
  }

  // `renumberSubImages` re-sorts by `order` before reassigning 1..N, so the
  // placeholder here must sort AFTER every existing image (append to the
  // end) — `order: 0` would sort BEFORE all existing subs (1..N) and jump
  // the new image to the front instead.
  const maxOrder = images.reduce((max, img) => Math.max(max, img.order), 0);
  images.push({
    url: image.url,
    publicId: image.publicId,
    isPrimary: images.length === 0,
    order: maxOrder + 1,
  });
  const updated = await productRepository.updateById(productId, {
    images: renumberSubImages(images),
    updatedBy: actorId,
  });
  return withImageView(updated!);
}

/** Prompt (Product Image Management) Part 19 — the main image can never be removed via this route; it must be replaced via `setMainProductImage` instead, so a product is never left without one. */
export async function removeSubProductImage(productId: string, publicId: string, actorId: string) {
  const product = await getProductById(productId);
  const images: ProductImage[] = (product.images ?? []).map((img) => ({ ...img }));
  const target = images.find((img) => img.publicId === publicId);
  if (!target) throw new NotFoundError('Product image');
  if (target.isPrimary) {
    throw new UnprocessableEntityError(
      'Cannot remove the main image directly — replace it with a new one instead',
    );
  }

  const nextImages = renumberSubImages(images.filter((img) => img.publicId !== publicId));
  const updated = await productRepository.updateById(productId, {
    images: nextImages,
    updatedBy: actorId,
  });

  try {
    await destroyAsset(publicId);
  } catch (err) {
    logger.error({ err, productId, publicId }, 'Failed to delete sub-image Cloudinary asset after removal');
  }

  return withImageView(updated!);
}

/** Prompt (Product Image Management) Part 18 — "reorder sub-images if practical." `publicIds` must be exactly the product's current sub-image set (any order); mismatches (stale client state, tampering) are rejected rather than silently dropping/duplicating entries. */
export async function reorderSubProductImages(
  productId: string,
  publicIds: string[],
  actorId: string,
) {
  const product = await getProductById(productId);
  const images: ProductImage[] = (product.images ?? []).map((img) => ({ ...img }));
  const main = images.find((img) => img.isPrimary) ?? null;
  const subs = images.filter((img) => !img.isPrimary);

  const currentIds = new Set(subs.map((img) => img.publicId));
  const requestedIds = new Set(publicIds);
  const sameSet =
    currentIds.size === requestedIds.size && [...currentIds].every((id) => requestedIds.has(id));
  if (!sameSet) {
    throw new ValidationError('publicIds must match the product\'s current set of sub-images exactly');
  }

  const byId = new Map(subs.map((img) => [img.publicId, img]));
  const reordered = publicIds.map((id, index) => ({ ...byId.get(id)!, order: index + 1 }));
  const nextImages = main ? [main, ...reordered] : reordered;

  const updated = await productRepository.updateById(productId, {
    images: nextImages,
    updatedBy: actorId,
  });
  return withImageView(updated!);
}

const EXCEL_COLUMNS = [
  { header: 'name', key: 'name', width: 30 },
  { header: 'slug', key: 'slug', width: 20 },
  { header: 'sku', key: 'sku', width: 15 },
  { header: 'categoryId', key: 'categoryId', width: 26 },
  { header: 'brandId', key: 'brandId', width: 26 },
  { header: 'basePrice', key: 'basePrice', width: 12 },
  { header: 'mrp', key: 'mrp', width: 12 },
  { header: 'gstRate', key: 'gstRate', width: 10 },
  // Prompt 30 — per-unit commercial shipping charge, same bulk-upload
  // treatment as gstRate (optional column, numeric, non-negative).
  { header: 'shippingCharge', key: 'shippingCharge', width: 14 },
  { header: 'genericName', key: 'genericName', width: 25 },
  { header: 'prescriptionRequired', key: 'prescriptionRequired', width: 10 },
  { header: 'isActive', key: 'isActive', width: 10 },
];

/**
 * Prompt 30 Part 26 — a bulk-upload row's `gstRate`/`shippingCharge`/
 * `basePrice`/`mrp` cell skips the Zod HTTP validator entirely
 * (`importProductsFromExcel` calls `createProduct()` directly, not the
 * `POST /products` route), so Mongoose's own `min`/`max` schema validators
 * were the only guard left — and those silently pass a non-numeric cell
 * through: `Number("abc")` is `NaN`, and every JS comparison against `NaN`
 * (`NaN < 0`, `NaN > 28`) evaluates to `false`, so Mongoose's `min: 0`/
 * `max: 28` never actually rejects it. A row with a corrupted numeric cell
 * would previously silently persist `NaN` as the stored price/tax/shipping
 * value — exactly the "invalid rows must not silently create incorrect
 * financial values" failure Part 26 explicitly warns against. Required
 * fields throw when missing; optional fields (gstRate/shippingCharge) are
 * only validated when the cell is actually present.
 */
function parseRequiredNonNegativeNumber(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative number, got "${value}"`);
  }
  return n;
}

function parseOptionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parseRequiredNonNegativeNumber(value, fieldName);
}

export async function importProductsFromExcel(
  buffer: Buffer,
  actorId: string,
): Promise<BulkOperationResult> {
  const rows = await parseExcelBuffer(buffer);
  const result = new BulkResultBuilder(rows.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = String(row.name ?? '').trim();
      const sku = String(row.sku ?? '').trim();
      const categoryId = String(row.categoryId ?? '').trim();
      if (!name || !sku || !categoryId)
        throw new ValidationError('name, sku, and categoryId are required');

      await createProduct(
        {
          name,
          sku,
          slug: row.slug ? String(row.slug) : undefined,
          categoryId,
          brandId: row.brandId ? String(row.brandId) : undefined,
          basePrice: parseRequiredNonNegativeNumber(row.basePrice ?? 0, 'basePrice'),
          mrp: parseRequiredNonNegativeNumber(row.mrp ?? 0, 'mrp'),
          gstRate: parseOptionalNonNegativeNumber(row.gstRate, 'gstRate'),
          shippingCharge: parseOptionalNonNegativeNumber(row.shippingCharge, 'shippingCharge'),
          medicine: row.genericName ? { genericName: String(row.genericName) } : undefined,
          isActive: row.isActive !== undefined ? Boolean(row.isActive) : undefined,
        },
        actorId,
      );
      result.ok();
    } catch (err) {
      result.fail(i, err instanceof Error ? err.message : 'Unknown error', String(row.sku ?? ''));
    }
  }

  return result.build();
}

export async function exportProductsToExcel(query: ListQuery): Promise<Buffer> {
  const filter: Record<string, unknown> = { ...query.filter };
  if (query.search) filter.$text = { $search: query.search };

  const products = await productRepository.find(filter, { sort: { createdAt: -1 } });
  const rows = products.map((p) => ({
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    categoryId: String(p.categoryId),
    brandId: p.brandId ? String(p.brandId) : '',
    basePrice: p.basePrice,
    mrp: p.mrp,
    gstRate: p.gstRate,
    shippingCharge: p.shippingCharge,
    genericName: p.medicine?.genericName ?? '',
    prescriptionRequired: p.medicine?.prescriptionRequired ?? false,
    isActive: p.isActive,
  }));

  return buildExcelBuffer('Products', EXCEL_COLUMNS, rows);
}
