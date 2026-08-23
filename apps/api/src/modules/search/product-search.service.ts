import { PAYMENT_STATUS } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { resolveProductAvailability } from '../catalog/bundle.service';
import { BrandModel } from '../catalog/models/brand.model';
import { ProductModel } from '../catalog/models/product.model';
import { OrderModel } from '../orders/models/order.model';

import { SearchLogModel } from './models/search-log.model';
import { buildSearchCacheKey, escapeRegexLiteral, normalizeSearchQuery, tokenizeQuery } from './search-normalize.util';
import { getSeoConfig } from './seo-config.service';

/**
 * Part 1 — the centralized SearchService for all customer-facing
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

/** Bounded candidate window for in-memory re-ranking (relevance and popularity sorts) — never the whole catalog, matching this project's "avoid loading entire collection" rule (Part 43). */
const CANDIDATE_CAP = 500;

/**
 * Ranking tiers for `sort=relevance` search results (Part 7 — "exact
 * product-name match > prefix match > exact multi-word match > generic-name
 * match > SKU match > other weaker matches"). Results are already
 * pre-filtered by `buildBaseFilter`'s AND-of-tokens query, so every
 * candidate here already matches ALL tokens somewhere — this only decides
 * tie-break order. Tier 3 ("all tokens present in name") is what makes a
 * reordered/interspersed match (e.g. query "extra paracetamol" against
 * "Paracetamol 500mg + Caffeine Tablets") still rank ahead of a match that
 * only hit the generic name or SKU, even though it's not a literal
 * contiguous substring of the query. Lower is better.
 */
function computeQueryMatchRank(
  item: { name: string; medicine?: { genericName?: string } | null; sku: string; tags?: string[]; brandId?: unknown },
  normalizedQuery: string,
  tokens: string[],
  matchedBrandIds: Set<string>,
): number {
  const q = normalizedQuery.toLowerCase();
  const name = item.name.toLowerCase();
  const generic = (item.medicine?.genericName ?? '').toLowerCase();
  const sku = item.sku.toLowerCase();
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  const brandMatches = item.brandId != null && matchedBrandIds.has(String(item.brandId));

  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (tokens.length > 0 && tokens.every((t) => name.includes(t))) return 3;
  if (generic === q || (tokens.length > 0 && tokens.every((t) => generic.includes(t)))) return 4;
  if (tokens.some((t) => generic.includes(t))) return 5;
  if (brandMatches) return 6;
  if (tokens.some((t) => sku.includes(t))) return 7;
  if (tokens.some((t) => tags.some((tag) => tag.includes(t)))) return 8;
  return 9;
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

const BRAND_INDEX_CACHE_KEY = 'search:brand-index:v1';
const BRAND_INDEX_CACHE_TTL_SECONDS = 10 * 60; // 10m — brands change rarely; short enough that a rename shows up quickly.

/**
 * Part 7/B — "TEST FAMILY B — BRAND + PRODUCT" needs brand NAME to be a
 * real search field, not just a display value. Brand name lives on a
 * separate `Brand` document (`product.brandId` only stores the reference),
 * so it can't be regex-matched directly on the Product collection the way
 * name/sku/genericName/tags can — confirmed live before this fix:
 * `q=reliefmax` (an actual seeded brand) returned 0 results even though
 * several products belong to it. The brand collection is small (tens of
 * rows, not thousands), so it's cached whole and matched in memory per
 * token rather than issuing a query per token or per request.
 */
async function getBrandIndex(): Promise<{ id: string; name: string }[]> {
  const cached = await redis.get(BRAND_INDEX_CACHE_KEY).catch(() => null);
  if (cached) return JSON.parse(cached) as { id: string; name: string }[];

  const brands = await BrandModel.find({ isActive: true }).select('name').lean();
  const index = brands.map((b) => ({ id: String(b._id), name: b.name.toLowerCase() }));
  await redis.set(BRAND_INDEX_CACHE_KEY, JSON.stringify(index), 'EX', BRAND_INDEX_CACHE_TTL_SECONDS).catch(() => undefined);
  return index;
}

/** Brand IDs whose name contains the given token — used to fold brand-name matching into the same per-token `$or` clause as name/sku/genericName/tags. */
function matchingBrandIds(brandIndex: { id: string; name: string }[], token: string): string[] {
  return brandIndex.filter((b) => b.name.includes(token)).map((b) => b.id);
}

async function buildBaseFilter(
  params: ProductSearchParams,
  normalizedQuery: string,
): Promise<{ filter: Record<string, unknown>; matchedBrandIds: Set<string> }> {
  const filter: Record<string, unknown> = { isActive: true };
  const matchedBrandIds = new Set<string>();

  if (normalizedQuery) {
    // Regex, not `$text` — `$text` does whole-word stemmed matching, so a
    // live "as you type" query like "para" would never match the indexed
    // term "paracetamol" (confirmed live: `q=para` returned 0 results here
    // while `q=paracetamol` correctly returned 3, the exact bug this fixes).
    // Matches the real, existing searchable fields — name, SKU, generic
    // name, tags — nothing invented.
    //
    // AND-of-tokens, not one whole-phrase regex — root-cause fix for a real
    // bug: the previous version ran the ENTIRE query string as a single
    // regex, so it only matched when every word appeared CONTIGUOUSLY, in
    // the SAME ORDER, in the SAME FIELD as the user typed it. A reordered
    // query ("extra paracetamol") or a query whose words are separated by
    // other text in the actual name ("paracetamol caffeine" against
    // "Paracetamol 500mg + Caffeine Tablets") matched ZERO results even
    // though every word was genuinely present — confirmed live before this
    // fix. Each token is now required independently (`$and`), and each
    // token may match in ANY of the searchable fields (`$or`) — this is
    // real AND-token matching, not "word1 OR word2 OR word3".
    // Part 7/B — brand NAME is also a real search field (see `getBrandIndex`
    // above): "TEST FAMILY B — BRAND + PRODUCT" requires `q=<brand name>`
    // and `q=<brand name> <product term>` to work, which a Product-only
    // regex can never do since brand name lives on a separate collection.
    const tokens = tokenizeQuery(normalizedQuery);
    const brandIndex = await getBrandIndex();
    filter.$and = tokens.map((token) => {
      const safeToken = escapeRegexLiteral(token);
      const regex = { $regex: safeToken, $options: 'i' };
      const brandIdsForToken = matchingBrandIds(brandIndex, token);
      brandIdsForToken.forEach((id) => matchedBrandIds.add(id));
      const clauses: Record<string, unknown>[] = [
        { name: regex },
        { sku: regex },
        { 'medicine.genericName': regex },
        { tags: regex },
      ];
      if (brandIdsForToken.length > 0) {
        clauses.push({ brandId: { $in: brandIdsForToken.map((id) => new mongoose.Types.ObjectId(id)) } });
      }
      return { $or: clauses };
    });
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
  return { filter, matchedBrandIds };
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
  const queryTokens = tokenizeQuery(normalizedQuery);
  const page = Math.max(1, rawParams.page ?? 1);
  const limit = Math.min(config.searchMaxResults, Math.max(1, rawParams.limit ?? 20));
  const skip = (page - 1) * limit;

  const { filter, matchedBrandIds } = await buildBaseFilter(rawParams, normalizedQuery);
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

    if (sort === 'relevance' && normalizedQuery) {
      // Part D — rank by match strength (name > generic > SKU) rather than
      // the ratingCount/ratingAvg fallback below, which only makes sense
      // as a tiebreaker/default when there's no query text to rank against.
      // Bounded candidate window, same "avoid loading entire collection"
      // rule as the popularity branch below.
      const facetPipeline = [...pipeline, { $facet: { items: [{ $limit: CANDIDATE_CAP }], total: [{ $count: 'count' }] } }];
      const [result] = await ProductModel.aggregate(facetPipeline);
      const candidates = (result?.items ?? []) as Record<string, unknown>[];
      candidates.sort(
        (a, b) =>
          computeQueryMatchRank(a as never, normalizedQuery, queryTokens, matchedBrandIds) -
          computeQueryMatchRank(b as never, normalizedQuery, queryTokens, matchedBrandIds),
      );
      total = result?.total?.[0]?.count ?? 0;
      items = candidates.slice(skip, skip + limit);
    } else {
      if (sort === 'price_asc') pipeline.push({ $sort: { basePrice: 1 } });
      else if (sort === 'price_desc') pipeline.push({ $sort: { basePrice: -1 } });
      // No `$text` query anymore (see `buildBaseFilter`), so there's no
      // `textScore` metadata to sort by — fall back to a real signal
      // (highest-rated/most-reviewed first) rather than an invented score.
      else if (sort === 'relevance') pipeline.push({ $sort: { ratingCount: -1, ratingAvg: -1, createdAt: -1 } });
      else if (sort !== 'popularity') pipeline.push({ $sort: { createdAt: -1 } });

      const facetPipeline = [...pipeline, { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } }];
      const [result] = await ProductModel.aggregate(facetPipeline);
      items = result?.items ?? [];
      total = result?.total?.[0]?.count ?? 0;
    }
  } else if (sort === 'popularity') {
    // Part 10/43 — every product matching the filter must still appear
    // under "popularity" sort (a never-sold product is still a valid search
    // match, just ranked LAST, not silently excluded — an earlier version
    // of this code excluded anything with zero sales entirely, which is a
    // real UX bug caught by live verification). Bounded to a reasonable
    // candidate window (not the whole catalog) before the in-memory
    // popularity re-sort, per Part 43's "avoid loading entire collection."
    const ranking = await getPopularityRanking();
    const [candidates, realTotal] = await Promise.all([
      ProductModel.find(filter).select(PUBLIC_PRODUCT_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_CAP).lean(),
      ProductModel.countDocuments(filter),
    ]);
    candidates.sort((a, b) => (ranking.get(String(a._id)) ?? Infinity) - (ranking.get(String(b._id)) ?? Infinity));
    total = realTotal;
    items = candidates.slice(skip, skip + limit) as unknown as Record<string, unknown>[];
  } else if (sort === 'relevance' && normalizedQuery) {
    // Part D — same bounded-candidate + in-memory rank-by-match-strength
    // strategy as the inStockOnly branch above; kept as two call sites
    // rather than a shared helper because the candidate fetch itself
    // (aggregation vs. plain `find`) differs between the two branches.
    const [candidates, realTotal] = await Promise.all([
      ProductModel.find(filter)
        .select(PUBLIC_PRODUCT_PROJECTION)
        .sort({ ratingCount: -1, ratingAvg: -1, createdAt: -1 })
        .limit(CANDIDATE_CAP)
        .lean(),
      ProductModel.countDocuments(filter),
    ]);
    candidates.sort(
      (a, b) =>
        computeQueryMatchRank(a as never, normalizedQuery, queryTokens, matchedBrandIds) -
        computeQueryMatchRank(b as never, normalizedQuery, queryTokens, matchedBrandIds),
    );
    total = realTotal;
    items = candidates.slice(skip, skip + limit) as unknown as Record<string, unknown>[];
  } else {
    const sortStage: Record<string, unknown> =
      sort === 'price_asc'
        ? { basePrice: 1 }
        : sort === 'price_desc'
          ? { basePrice: -1 }
          : sort === 'relevance'
            ? { ratingCount: -1, ratingAvg: -1, createdAt: -1 }
            : { createdAt: -1 };

    const query = ProductModel.find(filter);
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
