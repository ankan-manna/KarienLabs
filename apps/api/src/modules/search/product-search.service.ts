import { PAYMENT_STATUS } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { resolveProductAvailability } from '../catalog/bundle.service';
import { ProductModel } from '../catalog/models/product.model';
import { OrderModel } from '../orders/models/order.model';

import { SearchLogModel } from './models/search-log.model';
import { buildSearchCacheKey, normalizeSearchQuery } from './search-normalize.util';
import { getSeoConfig } from './seo-config.service';

/**
 * Prompt 23 Part 1 — the centralized SearchService for all customer-facing
 * product discovery. Every filter here is translated into a plain,
 * WHITELISTED Mongo query — never a raw passthrough of an arbitrary
 * client-supplied object (Part 39: no operator injection surface).
 *
 *   Customer Search -> Search API (search.routes.ts) -> THIS -> ProductModel
 *   (+ batchRepository for authoritative availability) -> filtered result
 */
export interface ProductSearchParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  manufacturerId?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  /** `true` = only prescription-required items, `false` = only OTC items, omitted = no filter. */
  prescriptionRequired?: boolean;
  tags?: string[];
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'popularity';
  page?: number;
  limit?: number;
}

/** Part 12 — customer-safe projection only: no reorderLevel (internal replenishment planning), no createdBy/updatedBy/deletedBy (audit trail), no barcode/hsnCode (internal/compliance-only), no supplier/cost data (doesn't exist on Product, but excluded defensively all the same). */
const PUBLIC_PRODUCT_PROJECTION =
  'name slug sku shortDescription basePrice mrp gstRate images medicine.genericName medicine.dosageForm medicine.strength medicine.prescriptionRequired medicine.schedule categoryId brandId manufacturerId tags isActive ratingAvg ratingCount seo createdAt';

export interface ProductSearchResult {
  items: Record<string, unknown>[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface PopularityCacheEntry {
  productId: string;
  unitsSold: number;
}

const POPULARITY_CACHE_KEY = 'search:popularity:v1';
const POPULARITY_CACHE_TTL_SECONDS = 60 * 60; // 1 hour — real order data, doesn't need to be live-fresh.
const POPULARITY_WINDOW_DAYS = 90;
const POPULARITY_TOP_N = 200;

/** Part 10 — "popularity" backed by REAL trailing-90-day order-line data (never claimed unless the data genuinely supports it), cached since it's the same ranking for every requester regardless of their filters. */
async function getPopularityRanking(): Promise<Map<string, number>> {
  const cached = await redis.get(POPULARITY_CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached) as PopularityCacheEntry[];
    return new Map(parsed.map((r, index) => [r.productId, index]));
  }

  const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, createdAt: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', unitsSold: { $sum: '$items.quantity' } } },
    { $sort: { unitsSold: -1 } },
    { $limit: POPULARITY_TOP_N },
  ]);

  const entries: PopularityCacheEntry[] = rows.map((r: { _id: unknown; unitsSold: number }) => ({
    productId: String(r._id),
    unitsSold: r.unitsSold,
  }));
  await redis.set(POPULARITY_CACHE_KEY, JSON.stringify(entries), 'EX', POPULARITY_CACHE_TTL_SECONDS);
  return new Map(entries.map((r, index) => [r.productId, index]));
}

function buildBaseFilter(params: ProductSearchParams, normalizedQuery: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { isActive: true };

  if (normalizedQuery) {
    filter.$text = { $search: normalizedQuery };
  }
  if (params.categoryId && mongoose.isValidObjectId(params.categoryId)) {
    filter.categoryId = new mongoose.Types.ObjectId(params.categoryId);
  }
  if (params.brandId && mongoose.isValidObjectId(params.brandId)) {
    filter.brandId = new mongoose.Types.ObjectId(params.brandId);
  }
  if (params.manufacturerId && mongoose.isValidObjectId(params.manufacturerId)) {
    filter.manufacturerId = new mongoose.Types.ObjectId(params.manufacturerId);
  }
  if (typeof params.priceMin === 'number' || typeof params.priceMax === 'number') {
    const range: Record<string, number> = {};
    if (typeof params.priceMin === 'number') range.$gte = params.priceMin;
    if (typeof params.priceMax === 'number') range.$lte = params.priceMax;
    filter.basePrice = range;
  }
  if (typeof params.prescriptionRequired === 'boolean') {
    // Part 9 — tri-state field (see product.model.ts): an explicit filter
    // request only ever matches products with an EXPLICIT true/false stored
    // (category-inherited "unset" products are intentionally excluded from
    // either explicit filter rather than guessed at, since guessing the
    // category default here would require a second lookup per candidate and
    // risk disagreeing with resolveProductDefaults()).
    filter['medicine.prescriptionRequired'] = params.prescriptionRequired;
  }
  if (params.tags && params.tags.length > 0) {
    filter.tags = { $in: params.tags.slice(0, 20) };
  }
  return filter;
}

/**
 * Part 1/2/6/7/8/9/10/11 — the main paginated, filtered, sorted product
 * search. `inStockOnly` requires joining live Batch stock (via
 * `batchRepository`, never a duplicated stock value), so that path uses a
 * `$lookup`-based aggregation; every other combination uses the cheaper
 * plain `find`, matching this project's "avoid expensive per-product calls
 * unless actually needed" performance rule (Part 43).
 */
async function runProductSearch(rawParams: ProductSearchParams): Promise<ProductSearchResult> {
  const config = await getSeoConfig();
  const normalizedQuery = normalizeSearchQuery(rawParams.q ?? '');
  const page = Math.max(1, rawParams.page ?? 1);
  const limit = Math.min(config.searchMaxResults, Math.max(1, rawParams.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter = buildBaseFilter(rawParams, normalizedQuery);
  const sort = rawParams.sort ?? (normalizedQuery ? 'relevance' : 'newest');

  let items: Record<string, unknown>[];
  let total: number;

  if (rawParams.inStockOnly) {
    // Combo-catalog fix — a bundle/combo product carries NO Batch rows of
    // its own (see bundle.service.ts's `resolveProductAvailability`), so the
    // plain `$lookup`-on-batches stock filter below would ALWAYS exclude
    // every combo from an "in stock only" search, regardless of its real
    // component-derived availability. Precompute which bundle candidates
    // (matching the same base filter) currently have positive derived
    // availability, then let the stock-filter stage admit those explicitly
    // alongside the existing batch-based check for plain products.
    const bundleCandidates = await ProductModel.find({ ...filter, isBundle: true })
      .select('_id')
      .lean();
    const bundleAvailability = await resolveProductAvailability(
      bundleCandidates.map((p) => String(p._id)),
    );
    const availableBundleIds = bundleCandidates
      .filter((p) => (bundleAvailability.get(String(p._id)) ?? 0) > 0)
      .map((p) => p._id);

    const pipeline: mongoose.PipelineStage[] = [
      { $match: filter },
      {
        $lookup: {
          from: 'batches',
          let: { productId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$productId', '$$productId'] }, deletedAt: null, quantityAvailable: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$quantityAvailable' } } },
          ],
          as: 'stock',
        },
      },
      {
        $match: {
          $or: [
            { $expr: { $gt: [{ $ifNull: [{ $first: '$stock.total' }, 0] }, 0] } },
            { _id: { $in: availableBundleIds } },
          ],
        },
      },
      { $project: { stock: 0 } },
    ];
    if (sort === 'price_asc') pipeline.push({ $sort: { basePrice: 1 } });
    else if (sort === 'price_desc') pipeline.push({ $sort: { basePrice: -1 } });
    else if (sort === 'relevance' && normalizedQuery) pipeline.push({ $sort: { score: { $meta: 'textScore' } } });
    else if (sort !== 'popularity') pipeline.push({ $sort: { createdAt: -1 } });

    const facetPipeline = [...pipeline, { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } }];
    const [result] = await ProductModel.aggregate(facetPipeline);
    items = result?.items ?? [];
    total = result?.total?.[0]?.count ?? 0;
  } else if (sort === 'popularity') {
    // Part 10/43 — every product matching the filter must still appear
    // under "popularity" sort (a never-sold product is still a valid search
    // match, just ranked LAST, not silently excluded — an earlier version
    // of this code excluded anything with zero sales entirely, which is a
    // real UX bug caught by live verification). Bounded to a reasonable
    // candidate window (not the whole catalog) before the in-memory
    // popularity re-sort, per Part 43's "avoid loading entire collection."
    const CANDIDATE_CAP = 500;
    const ranking = await getPopularityRanking();
    const [candidates, realTotal] = await Promise.all([
      ProductModel.find(filter).select(PUBLIC_PRODUCT_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_CAP).lean(),
      ProductModel.countDocuments(filter),
    ]);
    candidates.sort((a, b) => (ranking.get(String(a._id)) ?? Infinity) - (ranking.get(String(b._id)) ?? Infinity));
    total = realTotal;
    items = candidates.slice(skip, skip + limit) as unknown as Record<string, unknown>[];
  } else {
    const sortStage: Record<string, unknown> =
      sort === 'price_asc'
        ? { basePrice: 1 }
        : sort === 'price_desc'
          ? { basePrice: -1 }
          : sort === 'relevance' && normalizedQuery
            ? { score: { $meta: 'textScore' } }
            : { createdAt: -1 };

    const query = ProductModel.find(filter);
    if (sort === 'relevance' && normalizedQuery) query.select({ score: { $meta: 'textScore' } });
    const [foundItems, foundTotal] = await Promise.all([
      query.select(PUBLIC_PRODUCT_PROJECTION).sort(sortStage as never).skip(skip).limit(limit).lean(),
      ProductModel.countDocuments(filter),
    ]);
    items = foundItems as unknown as Record<string, unknown>[];
    total = foundTotal;
  }

  // Part 8/46 — authoritative availability badge, batched (one lookup for
  // the whole page, not one per row), bundle-aware via the same canonical
  // function `product.service.ts`/product detail also use (Part 20/26 — one
  // canonical combo/product availability calculation, never a second,
  // independently-computed stock value living inside SearchService).
  const productIds = items.map((item) => String((item as { _id: unknown })._id));
  const stockMap = await resolveProductAvailability(productIds);
  const itemsWithStock = items.map((item) => ({
    ...item,
    inStock: (stockMap.get(String((item as { _id: unknown })._id)) ?? 0) > 0,
  }));

  // Part 33/34 — zero-result tracking, fire-and-forget (never blocks the response).
  if (normalizedQuery) {
    SearchLogModel.create({ normalizedQuery, resultCount: total, hasResults: total > 0 }).catch((err) =>
      logger.warn({ err }, 'failed to record search log'),
    );
  }

  return {
    items: itemsWithStock,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * Part 37 — public entry point, wraps `runProductSearch` with a Redis cache.
 * Cache key includes every parameter that can change the result set (Part
 * 37: "normalized query, filters, sort, page, business context") and
 * contains only publicly-shareable product data (Part 12), so it's safe to
 * serve the same cached response to any anonymous requester. TTL comes from
 * SEO Configuration (`searchCacheDurationSeconds`), admin-tunable (Part 36).
 * `inStockOnly` results are intentionally NOT cached — stock changes far
 * more often than the cache TTL would otherwise reflect, and staleness here
 * directly contradicts Part 46's "must use authoritative availability."
 */
export async function searchProducts(rawParams: ProductSearchParams): Promise<ProductSearchResult> {
  if (rawParams.inStockOnly) return runProductSearch(rawParams);

  const config = await getSeoConfig();
  const cacheKey = buildSearchCacheKey({
    namespace: 'products',
    normalizedQuery: normalizeSearchQuery(rawParams.q ?? ''),
    filters: {
      categoryId: rawParams.categoryId ?? '',
      brandId: rawParams.brandId ?? '',
      manufacturerId: rawParams.manufacturerId ?? '',
      priceMin: rawParams.priceMin ?? '',
      priceMax: rawParams.priceMax ?? '',
      prescriptionRequired: rawParams.prescriptionRequired ?? '',
      tags: (rawParams.tags ?? []).slice().sort(),
    },
    sort: rawParams.sort ?? '',
    page: rawParams.page,
    limit: rawParams.limit,
  });

  const normalizedQuery = normalizeSearchQuery(rawParams.q ?? '');
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    const parsed = JSON.parse(cached) as ProductSearchResult;
    // Part 33/34 — a cache HIT still represents a real search request and
    // must still count toward popular/zero-result analytics, just without
    // re-running the query itself.
    if (normalizedQuery) {
      SearchLogModel.create({
        normalizedQuery,
        resultCount: parsed.meta.total,
        hasResults: parsed.meta.total > 0,
      }).catch((err) => logger.warn({ err }, 'failed to record search log (cache hit)'));
    }
    return parsed;
  }

  const result = await runProductSearch(rawParams);
  await redis
    .set(cacheKey, JSON.stringify(result), 'EX', config.searchCacheDurationSeconds)
    .catch((err) => logger.warn({ err }, 'failed to cache search result'));
  return result;
}
