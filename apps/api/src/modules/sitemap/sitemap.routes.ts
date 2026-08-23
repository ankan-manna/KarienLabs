import { Router } from 'express';

import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { CategoryModel } from '../catalog/models/category.model';
import { ProductModel } from '../catalog/models/product.model';
import { BlogModel } from '../cms/models/blog.model';
import { PageModel } from '../cms/models/page.model';
import { getSeoConfig, resolveCanonicalBase } from '../search/seo-config.service';

const STATIC_PATHS = [
  '/',
  '/products',
  '/about',
  '/contact',
  '/bulk-purchase',
  '/faq',
  '/blog',
  '/offers',
  '/brands',
  '/manufacturers',
  '/privacy-policy',
  '/terms',
  '/return-policy',
  '/shipping-policy',
  '/cancellation-policy',
  '/refund-policy',
];

/** The 7 policy/about pages each get a dedicated frontend route so their URL reads
 * naturally; every other CMS page slug falls back to the generic `/page/:slug` route. */
const KNOWN_PAGE_SLUGS = new Set([
  'about-us',
  'privacy-policy',
  'terms',
  'return-policy',
  'shipping-policy',
  'cancellation-policy',
  'refund-policy',
]);

function urlEntry(loc: string, lastmod?: Date): string {
  return `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>\n` : ''}  </url>`;
}

/** `updatedAt` is added by `auditPlugin()`'s `schema.set('timestamps', true)` at
 * runtime, invisible to `InferSchemaType` — same pattern as elsewhere in this
 * codebase where audit-plugin fields need a manual type on the lean projection. */
interface WithUpdatedAt {
  updatedAt?: Date;
}

const SITEMAP_CACHE_KEY = 'sitemap:xml:v2';
// Part 24 — regenerating a multi-thousand-URL sitemap on EVERY
// crawler request (which was the previous behavior) is wasted DB load;
// crawlers themselves only re-fetch a sitemap every few hours at most, so a
// 1-hour cache is generous headroom without meaningfully delaying a new
// product's visibility.
const SITEMAP_CACHE_TTL_SECONDS = 60 * 60;

async function buildSitemapXml(): Promise<string> {
  const config = await getSeoConfig();
  const base = resolveCanonicalBase(config);

  const [products, categories, blogs, pages] = (await Promise.all([
    // Part 14/23 — slug-based URLs (previously `_id`-based, which
    // is neither stable-looking nor SEO-friendly); `findByIdOrSlug` on the
    // detail route still resolves old bookmarked ID URLs too.
    ProductModel.find({ isActive: true, deletedAt: null }).select('slug updatedAt').limit(5000).lean(),
    CategoryModel.find({ isActive: true, deletedAt: null }).select('slug updatedAt').limit(1000).lean(),
    BlogModel.find({ isPublished: true, deletedAt: null }).select('slug updatedAt').limit(2000).lean(),
    PageModel.find({ isPublished: true, deletedAt: null }).select('slug updatedAt').limit(500).lean(),
  ])) as [
    (WithUpdatedAt & { slug: string })[],
    (WithUpdatedAt & { slug: string })[],
    (WithUpdatedAt & { slug: string })[],
    (WithUpdatedAt & { slug: string })[],
  ];

  // Policy/about pages are already covered by STATIC_PATHS with their real route
  // (e.g. "about-us" -> /about) — only emit the generic /page/:slug URL for pages
  // outside that known set, so nothing is listed twice under two different paths.
  const otherPages = pages.filter((p) => !KNOWN_PAGE_SLUGS.has(p.slug));

  const entries = [
    ...STATIC_PATHS.map((p) => urlEntry(`${base}${p}`)),
    ...products.map((p) => urlEntry(`${base}/products/${p.slug}`, p.updatedAt)),
    ...categories.map((c) => urlEntry(`${base}/categories/${c.slug}`, c.updatedAt)),
    ...blogs.map((b) => urlEntry(`${base}/blog/${b.slug}`, b.updatedAt)),
    ...otherPages.map((p) => urlEntry(`${base}/page/${p.slug}`, p.updatedAt)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
}

/**
 * Dynamically generated `sitemap.xml` (Part 23/24) and `robots.txt` (Part
 * 22) — served at the domain root (not under /api/v1) since that's where
 * crawlers expect them, matching the `/health` root-level route already on
 * this app. Both respect the SEO Configuration engine (Part 49: "Super
 * Admin disables sitemap -> sitemap endpoint must respect the disabled
 * state") — "noindex is NOT authorization" (Part 45), but neither of these
 * routes ever exposes anything beyond what's already public, so a disabled
 * state here means "return nothing useful," never a security control.
 */
export const sitemapRouter = Router();

sitemapRouter.get('/sitemap.xml', async (_req, res) => {
  const config = await getSeoConfig();
  if (!config.seoEnabled || !config.sitemapEnabled) {
    res.setHeader('Content-Type', 'application/xml');
    return res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }

  const cached = await redis.get(SITEMAP_CACHE_KEY).catch(() => null);
  if (cached) {
    res.setHeader('Content-Type', 'application/xml');
    return res.send(cached);
  }

  const xml = await buildSitemapXml();
  await redis.set(SITEMAP_CACHE_KEY, xml, 'EX', SITEMAP_CACHE_TTL_SECONDS).catch((err) => {
    logger.warn({ err }, 'failed to cache sitemap.xml');
  });

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

/**
 * Part 22 — `robotsEnabled: true` (default) advertises the public storefront
 * as crawlable while explicitly disallowing every private area (Part 45:
 * admin/account/checkout/cart/payment/internal APIs) — this is advisory
 * metadata for well-behaved crawlers, NOT an authorization mechanism; every
 * one of those paths is independently backend-auth-enforced regardless of
 * what this file says (Part 22/45's explicit warning).
 * `robotsEnabled: false` (e.g. a staging deployment) emits a strict
 * deny-all so the deployment is never indexed at all.
 */
sitemapRouter.get('/robots.txt', async (_req, res) => {
  const config = await getSeoConfig();
  const base = resolveCanonicalBase(config);
  res.setHeader('Content-Type', 'text/plain');

  if (!config.seoEnabled || !config.robotsEnabled) {
    return res.send('User-agent: *\nDisallow: /\n');
  }

  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /account/',
    'Disallow: /checkout',
    'Disallow: /cart',
    'Disallow: /payment',
    'Disallow: /api/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
  ];
  res.send(lines.join('\n'));
});
