/**
 * Part 25/26/46/47 — pure schema.org Product JSON-LD builder.
 * Every field is sourced from REAL, already-authoritative data passed in by
 * the caller (never fabricated):
 *   - price/availability: the SAME values the storefront already shows
 *     (basePrice, and the batchRepository-derived `inStock` flag) — Part
 *     46/47, never a stale cache, never internal cost.
 *   - aggregateRating: OMITTED entirely unless `ratingCount > 0` — Part 25's
 *     explicit "do not fabricate ratings/reviews... if review/rating data
 *     does not exist, do not create fake rating markup."
 *   - no medical claims of any kind are generated — Part 26.
 */

export interface StructuredDataProductInput {
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  sku: string;
  images: { url: string; isPrimary?: boolean }[];
  basePrice: number;
  brandName?: string | null;
  inStock: boolean;
  ratingAvg?: number;
  ratingCount?: number;
}

export interface JsonLdProduct {
  '@context': 'https://schema.org';
  '@type': 'Product';
  name: string;
  sku: string;
  description?: string;
  image?: string[];
  brand?: { '@type': 'Brand'; name: string };
  offers: {
    '@type': 'Offer';
    url: string;
    priceCurrency: 'INR';
    price: string;
    availability: 'https://schema.org/InStock' | 'https://schema.org/OutOfStock';
  };
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: string;
    reviewCount: number;
  };
}

/** `canonicalBase` is the site's canonical origin (from seo-config.service.ts's `resolveCanonicalBase`), never hardcoded here. */
export function buildProductStructuredData(
  product: StructuredDataProductInput,
  canonicalBase: string,
): JsonLdProduct {
  const description = product.shortDescription || product.description || '';
  const images = product.images.map((img) => img.url).filter(Boolean);

  const data: JsonLdProduct = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    ...(description ? { description } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    ...(product.brandName ? { brand: { '@type': 'Brand', name: product.brandName } } : {}),
    offers: {
      '@type': 'Offer',
      url: `${canonicalBase}/products/${product.slug}`,
      priceCurrency: 'INR',
      price: product.basePrice.toFixed(2),
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  // Part 25 — only ever added when REAL review data exists.
  if (product.ratingCount && product.ratingCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (product.ratingAvg ?? 0).toFixed(1),
      reviewCount: product.ratingCount,
    };
  }

  return data;
}

export interface JsonLdCategory {
  '@context': 'https://schema.org';
  '@type': 'CollectionPage';
  name: string;
  description?: string;
  url: string;
}

export function buildCategoryStructuredData(
  category: { name: string; slug: string; description?: string },
  canonicalBase: string,
): JsonLdCategory {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.name,
    ...(category.description ? { description: category.description } : {}),
    url: `${canonicalBase}/categories/${category.slug}`,
  };
}

export interface JsonLdFaqPage {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: {
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }[];
}

/** Part 28/29 — only ever built from admin-authored FAQ entries actually stored on the product/category; never generated. Returns `null` when there are no entries (nothing to mark up). */
export function buildFaqStructuredData(faq: { question: string; answer: string }[]): JsonLdFaqPage | null {
  if (!faq || faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}
