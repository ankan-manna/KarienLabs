import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { BrandModel } from '../catalog/models/brand.model';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import { BlogModel } from '../cms/models/blog.model';

import { findFuzzyMatches } from './fuzzy-match.util';
import { SearchLogModel } from './models/search-log.model';
import { buildSearchCacheKey, escapeRegexLiteral, isQueryLengthValid, normalizeSearchQuery, tokenizeQuery } from './search-normalize.util';
import { getSeoConfig } from './seo-config.service';

const DICTIONARY_CACHE_KEY = 'search:term-dictionary:v1';
const DICTIONARY_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — the catalog doesn't change fast enough to need a shorter refresh.
const DICTIONARY_MIN_WORD_LENGTH = 4;
const DICTIONARY_MAX_TERMS = 500;

/**
 * Part 5 — the fuzzy-match dictionary: distinct significant words drawn from
 * REAL product name/generic-name data (never a static hardcoded list, never
 * the whole catalog scanned per request — cached). Short/common words are
 * filtered out to avoid noisy suggestions (e.g. "the", "and", "500mg"-style
 * numeric tokens).
 */
async function getSearchTermDictionary(): Promise<string[]> {
  const cached = await redis.get(DICTIONARY_CACHE_KEY).catch(() => null);
  if (cached) return JSON.parse(cached) as string[];

  const rows = await ProductModel.find({ isActive: true })
    .select('name medicine.genericName')
    .limit(5000)
    .lean();

  const words = new Set<string>();
  for (const row of rows as { name?: string; medicine?: { genericName?: string } }[]) {
    for (const source of [row.name, row.medicine?.genericName]) {
      if (!source) continue;
      for (const word of source.toLowerCase().split(/[^a-z]+/)) {
        if (word.length >= DICTIONARY_MIN_WORD_LENGTH) words.add(word);
      }
    }
    if (words.size >= DICTIONARY_MAX_TERMS) break;
  }

  const dictionary = [...words].slice(0, DICTIONARY_MAX_TERMS);
  await redis.set(DICTIONARY_CACHE_KEY, JSON.stringify(dictionary), 'EX', DICTIONARY_CACHE_TTL_SECONDS);
  return dictionary;
}

async function recordSearchLog(normalizedQuery: string, resultCount: number): Promise<void> {
  if (!normalizedQuery) return;
  SearchLogModel.create({ normalizedQuery, resultCount, hasResults: resultCount > 0 }).catch((err) =>
    logger.warn({ err }, 'failed to record search log'),
  );
}

/**
 * Cross-collection search — products (primary, text-indexed), categories
 * (name prefix), blog posts (text-indexed). Each capped small; this is a
 * "did you mean" surface, not a paginated results page. Part 3/39 — query
 * length is bounded via SEO Configuration BEFORE it reaches any query; Part
 * 5 — falls back to fuzzy-matched product-name suggestions when the literal
 * query finds nothing.
 */
export async function globalSearch(rawQuery: string) {
  const config = await getSeoConfig();
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  if (!isQueryLengthValid(normalizedQuery, config.searchMinLength, config.searchMaxLength)) {
    return { products: [], categories: [], blogPosts: [], didYouMean: [] };
  }
  const safeQuery = escapeRegexLiteral(normalizedQuery);
  const queryTokens = tokenizeQuery(normalizedQuery);

  const [products, categories, blogPosts] = await Promise.all([
    // Regex match on name/sku/genericName rather than `$text` — `$text` does whole-word
    // stemmed matching only, so a partial "as you type" query like "para" would never
    // match the indexed term "paracetamol". AND-of-tokens (not one whole-phrase regex)
    // for the same multi-word reason as `product-search.service.ts`'s `buildBaseFilter`.
    ProductModel.find({
      isActive: true,
      $and: queryTokens.map((token) => {
        const safeToken = escapeRegexLiteral(token);
        const regex = { $regex: safeToken, $options: 'i' };
        return { $or: [{ name: regex }, { sku: regex }, { 'medicine.genericName': regex }] };
      }),
    })
      .select('name slug sku basePrice mrp images')
      .limit(10)
      .lean(),
    CategoryModel.find({ name: { $regex: safeQuery, $options: 'i' }, isActive: true })
      .select('name slug')
      .limit(5)
      .lean(),
    BlogModel.find({ $text: { $search: normalizedQuery }, isPublished: true })
      .select('title slug excerpt')
      .limit(5)
      .lean(),
  ]);

  const totalResults = products.length + categories.length + blogPosts.length;
  let didYouMean: string[] = [];
  if (totalResults === 0) {
    const dictionary = await getSearchTermDictionary();
    didYouMean = findFuzzyMatches(normalizedQuery, dictionary);
  }

  await recordSearchLog(normalizedQuery, totalResults);

  return { products, categories, blogPosts, didYouMean };
}

/**
 * Ranking tiers for the navbar suggestion dropdown (exact name > prefix
 * name > all-tokens-in-name > generic name > SKU match; brand/category
 * aren't part of the match set here, only shown for display). Tier 3
 * ("all tokens present in name") is what keeps a reordered/interspersed
 * multi-word query ranked ahead of a weaker generic/SKU-only match, same
 * reasoning as `product-search.service.ts`'s `computeQueryMatchRank`.
 * Lower is better.
 */
function rankSuggestion(
  item: { name: string; medicine?: { genericName?: string } | null; sku: string },
  query: string,
  tokens: string[],
): number {
  const q = query.toLowerCase();
  const name = item.name.toLowerCase();
  const generic = (item.medicine?.genericName ?? '').toLowerCase();
  const sku = item.sku.toLowerCase();

  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (tokens.length > 0 && tokens.every((t) => name.includes(t))) return 3;
  if (generic === q || (tokens.length > 0 && tokens.every((t) => generic.includes(t)))) return 4;
  if (tokens.some((t) => generic.includes(t))) return 5;
  if (tokens.some((t) => sku.includes(t))) return 6;
  return 7;
}

const BRAND_INDEX_CACHE_KEY = 'search:brand-index:v1';
const BRAND_INDEX_CACHE_TTL_SECONDS = 10 * 60;

/** Same cached brand name→id index as `product-search.service.ts` (shared Redis key, so both endpoints reuse one cache entry) — lets a brand name like "ReliefMax" match here too, not just in the results page. */
async function getBrandIndex(): Promise<{ id: string; name: string }[]> {
  const cached = await redis.get(BRAND_INDEX_CACHE_KEY).catch(() => null);
  if (cached) return JSON.parse(cached) as { id: string; name: string }[];
  const brands = await BrandModel.find({ isActive: true }).select('name').lean();
  const index = brands.map((b) => ({ id: String(b._id), name: b.name.toLowerCase() }));
  await redis.set(BRAND_INDEX_CACHE_KEY, JSON.stringify(index), 'EX', BRAND_INDEX_CACHE_TTL_SECONDS).catch(() => undefined);
  return index;
}

export interface AutocompleteSuggestion {
  _id: string;
  name: string;
  slug: string;
  image: string | null;
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  categoryName: string | null;
}

/**
 * Part 4/37 — cached, config-bounded typeahead suggestions. Originally
 * prefix-anchored (`^query`) for index efficiency, but that broke on real
 * catalog data: product names here are stored as e.g. "P23 Paracetamol
 * 500mg" (an internal code prefix before the actual drug name), so a
 * prefix-anchored search for "para" matched nothing even though the
 * product obviously contains "Paracetamol" — confirmed live (`^para`
 * returned 0, `^p23` returned 3). Switched to an unanchored substring
 * match across name, generic name and SKU, matching how `globalSearch`
 * above already does it correctly.
 *
 * Fetches a small bounded CANDIDATE pool (capped, never the whole catalog),
 * ranks in-memory by match strength (`rankSuggestion`), then trims to the
 * configured `suggestionLimit` and enriches only that final page with
 * brand/category name + primary image — a 1mg-style suggestion needs those
 * for display, but resolving them for the whole candidate pool would waste
 * work on rows that get discarded by ranking anyway.
 */
export async function autocomplete(rawPrefix: string): Promise<AutocompleteSuggestion[]> {
  const config = await getSeoConfig();
  const normalizedPrefix = normalizeSearchQuery(rawPrefix);
  if (!isQueryLengthValid(normalizedPrefix, config.searchMinLength, config.searchMaxLength)) {
    return [];
  }

  const cacheKey = buildSearchCacheKey({ namespace: 'autocomplete', normalizedQuery: normalizedPrefix });
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as AutocompleteSuggestion[];

  // AND-of-tokens (not one whole-phrase regex) — same root-cause fix as
  // `product-search.service.ts`'s `buildBaseFilter`: a multi-word typeahead
  // query like "paracetamol caffeine" must match a product whose words
  // appear in either order / with other text between them, not only an
  // exact contiguous substring.
  const tokens = tokenizeQuery(normalizedPrefix);
  const brandIndex = await getBrandIndex();
  const CANDIDATE_CAP = Math.min(config.suggestionLimit * 3, 30);
  const candidates = await ProductModel.find({
    isActive: true,
    $and: tokens.map((token) => {
      const safeToken = escapeRegexLiteral(token);
      const regex = { $regex: safeToken, $options: 'i' };
      const brandIdsForToken = brandIndex.filter((b) => b.name.includes(token)).map((b) => b.id);
      const clauses: Record<string, unknown>[] = [{ name: regex }, { 'medicine.genericName': regex }, { sku: regex }];
      if (brandIdsForToken.length > 0) clauses.push({ brandId: { $in: brandIdsForToken } });
      return { $or: clauses };
    }),
  })
    .select('name slug sku images medicine.genericName medicine.strength categoryId brandId')
    .limit(CANDIDATE_CAP)
    .lean();

  candidates.sort(
    (a, b) => rankSuggestion(a, normalizedPrefix, tokens) - rankSuggestion(b, normalizedPrefix, tokens),
  );
  const top = candidates.slice(0, config.suggestionLimit);

  const brandIds = [...new Set(top.map((p) => p.brandId).filter(Boolean).map((id) => String(id)))];
  const categoryIds = [...new Set(top.map((p) => p.categoryId).filter(Boolean).map((id) => String(id)))];
  const [brands, categories] = await Promise.all([
    brandIds.length > 0 ? BrandModel.find({ _id: { $in: brandIds } }).select('name').lean() : Promise.resolve([]),
    categoryIds.length > 0 ? CategoryModel.find({ _id: { $in: categoryIds } }).select('name').lean() : Promise.resolve([]),
  ]);
  const brandNameById = new Map(brands.map((b) => [String(b._id), b.name]));
  const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));

  const suggestions: AutocompleteSuggestion[] = top.map((p) => {
    const primaryImage = p.images?.find((img) => img.isPrimary) ?? p.images?.[0] ?? null;
    return {
      _id: String(p._id),
      name: p.name,
      slug: p.slug,
      image: primaryImage?.url ?? null,
      brandName: p.brandId ? (brandNameById.get(String(p.brandId)) ?? null) : null,
      genericName: p.medicine?.genericName || null,
      strength: p.medicine?.strength || null,
      categoryName: p.categoryId ? (categoryNameById.get(String(p.categoryId)) ?? null) : null,
    };
  });

  await recordSearchLog(normalizedPrefix, suggestions.length);

  await redis
    .set(cacheKey, JSON.stringify(suggestions), 'EX', config.searchCacheDurationSeconds)
    .catch((err) => logger.warn({ err }, 'failed to cache autocomplete result'));

  return suggestions;
}
