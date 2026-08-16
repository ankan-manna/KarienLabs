import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import { BlogModel } from '../cms/models/blog.model';

import { findFuzzyMatches } from './fuzzy-match.util';
import { SearchLogModel } from './models/search-log.model';
import { buildSearchCacheKey, escapeRegexLiteral, isQueryLengthValid, normalizeSearchQuery } from './search-normalize.util';
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

  const [products, categories, blogPosts] = await Promise.all([
    // Regex match on name/sku/genericName rather than `$text` — `$text` does whole-word
    // stemmed matching only, so a partial "as you type" query like "para" would never
    // match the indexed term "paracetamol". Regex gives correct substring matching for
    // this small, capped "did you mean" surface.
    ProductModel.find({
      isActive: true,
      $or: [
        { name: { $regex: safeQuery, $options: 'i' } },
        { sku: { $regex: safeQuery, $options: 'i' } },
        { 'medicine.genericName': { $regex: safeQuery, $options: 'i' } },
      ],
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
 * Part 4/37 — cached, config-bounded typeahead suggestions. Fast by
 * construction: a small `limit`, a prefix-anchored (not substring) regex
 * (able to use the `name` index's leading characters far more cheaply than
 * an unanchored scan), and a short Redis cache shared across requesters
 * (safe — product name/slug is public data).
 */
export async function autocomplete(rawPrefix: string) {
  const config = await getSeoConfig();
  const normalizedPrefix = normalizeSearchQuery(rawPrefix);
  if (!isQueryLengthValid(normalizedPrefix, config.searchMinLength, config.searchMaxLength)) {
    return [];
  }

  const cacheKey = buildSearchCacheKey({ namespace: 'autocomplete', normalizedQuery: normalizedPrefix });
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const products = await ProductModel.find({
    name: { $regex: `^${escapeRegexLiteral(normalizedPrefix)}`, $options: 'i' },
    isActive: true,
  })
    .select('name slug')
    .limit(config.suggestionLimit)
    .lean();

  await recordSearchLog(normalizedPrefix, products.length);

  await redis
    .set(cacheKey, JSON.stringify(products), 'EX', config.searchCacheDurationSeconds)
    .catch((err) => logger.warn({ err }, 'failed to cache autocomplete result'));

  return products;
}
