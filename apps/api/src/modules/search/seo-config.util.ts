import { UnprocessableEntityError } from '../../utils/app-error';

/**
 * Part 16/17/19/36/46/49 — pure, DB/Redis-free config shape +
 * validation, same triple-file split as analytics-config.util.ts ( 22)
 * / coupon-config.util.ts ( 19): configuration.service.ts transitively
 * imports the Redis-backed maintenance-mode cache, and importing that as a
 * side effect of a plain unit test opens a real Redis connection.
 *
 * Design: ONE master `seoEnabled` switch over the SEO/AEO/GEO surface
 * (sitemap, robots, structured data, canonical, product/category SEO, AEO,
 * GEO) so a Super Admin can hide the whole discovery-metadata layer from
 * Platform Admins (Part 17's own example: "SEO = ENABLED, Sitemap = ENABLED,
 * AEO = DISABLED, GEO = ENABLED" — independently toggleable sub-domains
 * under one umbrella). Core product SEARCH itself is deliberately NOT
 * behind a feature flag here — it's basic storefront functionality, not an
 * optional SEO capability; only its TUNABLES (min/max length, result caps,
 * cache duration) are admin-configurable.
 */
export interface SeoConfig {
  /** Part 1/2/17 — the master switch over every *SeoEnabled/aeoEnabled/geoEnabled/etc. flag below. */
  seoEnabled: boolean;
  productSeoEnabled: boolean;
  categorySeoEnabled: boolean;
  sitemapEnabled: boolean;
  /** Part 22 — whether robots.txt advertises "allow public pages" (true) or a strict deny-all (false, e.g. for a staging deployment that must never be indexed). */
  robotsEnabled: boolean;
  structuredDataEnabled: boolean;
  canonicalEnabled: boolean;
  aeoEnabled: boolean;
  geoEnabled: boolean;

  // Part 19 — global SEO defaults, used when a product/category has no
  // explicit seoTitle/metaDescription/OG image of its own.
  siteTitle: string;
  siteDescription: string;
  /** Relative path (e.g. "/logo.jpg") or absolute URL; resolved against the canonical base URL at read time — see seo-config.service.ts. Part 20 — never a local filesystem path. */
  defaultOgImage: string;
  /** Empty means "use env.WEB_BASE_URL" — Part 19/20: never hardcode a production domain into code. */
  canonicalBaseUrl: string;

  // Part 36 — search tunables.
  searchMinLength: number;
  searchMaxLength: number;
  searchMaxResults: number;
  suggestionLimit: number;
  searchCacheDurationSeconds: number;
}

export const DEFAULT_SEO_CONFIG: SeoConfig = {
  seoEnabled: true,
  productSeoEnabled: true,
  categorySeoEnabled: true,
  sitemapEnabled: true,
  robotsEnabled: true,
  structuredDataEnabled: true,
  canonicalEnabled: true,
  aeoEnabled: true,
  geoEnabled: true,

  siteTitle: 'KarienLabs — Online Medical Store',
  siteDescription: 'Order medicines and healthcare products online with fast, reliable delivery.',
  defaultOgImage: '/logo.jpg',
  canonicalBaseUrl: '',

  searchMinLength: 2,
  searchMaxLength: 100,
  searchMaxResults: 50,
  suggestionLimit: 10,
  searchCacheDurationSeconds: 60,
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_SEO_CONFIG));

export type SeoDomainKey =
  | 'productSeoEnabled'
  | 'categorySeoEnabled'
  | 'sitemapEnabled'
  | 'robotsEnabled'
  | 'structuredDataEnabled'
  | 'canonicalEnabled'
  | 'aeoEnabled'
  | 'geoEnabled';

/** Every gateable SEO/AEO/GEO domain flag except the master switch itself — typed to exactly the boolean-flag keys so `next[key] = false` (used by the service's master-off cascade) type-checks without a cast. */
export const SEO_DOMAIN_KEYS: SeoDomainKey[] = [
  'productSeoEnabled',
  'categorySeoEnabled',
  'sitemapEnabled',
  'robotsEnabled',
  'structuredDataEnabled',
  'canonicalEnabled',
  'aeoEnabled',
  'geoEnabled',
];

const NUMERIC_KEYS: Array<keyof SeoConfig> = [
  'searchMinLength',
  'searchMaxLength',
  'searchMaxResults',
  'suggestionLimit',
  'searchCacheDurationSeconds',
];

/** Part 46/52 — whitelist validation (unknown keys rejected) + the master-off dependency rule + sane numeric-tunable bounds (Part 39 abuse protection: an admin can't configure e.g. searchMaxResults=1000000). */
export function validateSeoConfig(next: SeoConfig): void {
  for (const key of Object.keys(next)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UnprocessableEntityError(`Unknown SEO configuration key: "${key}"`);
    }
  }
  if (!next.seoEnabled) {
    const stillOn = SEO_DOMAIN_KEYS.filter((k) => next[k] === true);
    if (stillOn.length > 0) {
      throw new UnprocessableEntityError(`Cannot enable ${stillOn.join(', ')} while SEO is disabled`);
    }
  }
  for (const key of NUMERIC_KEYS) {
    const value = next[key] as number;
    if (!Number.isFinite(value) || value <= 0) {
      throw new UnprocessableEntityError(`"${key}" must be a positive number`);
    }
  }
  if (next.searchMinLength > next.searchMaxLength) {
    throw new UnprocessableEntityError('"searchMinLength" cannot be greater than "searchMaxLength"');
  }
  if (next.searchMaxLength > 200) {
    throw new UnprocessableEntityError('"searchMaxLength" cannot exceed 200');
  }
  if (next.searchMaxResults > 200) {
    throw new UnprocessableEntityError('"searchMaxResults" cannot exceed 200');
  }
  if (next.suggestionLimit > 25) {
    throw new UnprocessableEntityError('"suggestionLimit" cannot exceed 25');
  }
  if (next.searchCacheDurationSeconds > 3600) {
    throw new UnprocessableEntityError('"searchCacheDurationSeconds" cannot exceed 3600');
  }
}
