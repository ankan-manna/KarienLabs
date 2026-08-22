import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { PaginatedMeta } from './types';

export interface PublicProduct {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  basePrice: number;
  mrp: number;
  gstRate: number;
  images: { url: string; isPrimary: boolean }[];
  // Prompt (Product Image Management) — server-derived from `images` (Part
  // 5/22), always present; `mainImage` is `null` only when the product has
  // no images at all.
  mainImage: { url: string; publicId: string } | null;
  subImages: { url: string; publicId: string; sortOrder: number }[];
  medicine?: {
    genericName?: string;
    prescriptionRequired?: boolean;
    composition?: string;
    dosageForm?: string;
    strength?: string;
    storageInstructions?: string;
  };
  categoryId: string;
  brandId?: string | null;
  /** Resolved server-side (batched per page) — `null` when the product has no brand. */
  brandName?: string | null;
  isActive: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string };
  /**
   * Authoritative "can I sell this right now" flag, computed server-side —
   * never derived on the client. For a plain product this is real Batch
   * stock; for a combo/bundle SKU it's derived from component availability
   * (see bundle.service.ts's `resolveProductAvailability`). Returned by
   * BOTH the list endpoint (`GET /products`) and search — a zero-stock
   * product/combo is still returned (never hidden), just flagged
   * `inStock: false` so the UI can show an Out of Stock state.
   */
  inStock: boolean;
}

export async function listProducts(params: {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filter?: Record<string, string>;
}): Promise<{ items: PublicProduct[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PublicProduct[]>>('/products', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

/** Only the detail endpoint computes these (brand/manufacturer name lookup + FAQ/structured data). */
export interface PublicProductDetail extends PublicProduct {
  brand: { _id: string; name: string; slug: string } | null;
  manufacturer: { _id: string; name: string; slug: string } | null;
  faq?: { question: string; answer: string }[];
  /**
   * Prompt 23 Part 25/46/47 — server-computed schema.org Product JSON-LD,
   * ALREADY correct against the real `inStock`/`basePrice` this same
   * response returns (never re-derived client-side — a client-side rebuild
   * previously hardcoded `availability: InStock` regardless of actual
   * stock, which was a real bug). `null` when SEO/structured-data is
   * disabled via Configuration.
   */
  structuredData?: Record<string, unknown> | null;
  faqStructuredData?: Record<string, unknown> | null;
}

export async function getProduct(idOrSlug: string): Promise<PublicProductDetail> {
  const { data } = await httpClient.get<ApiResponse<PublicProductDetail>>(`/products/${idOrSlug}`);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface PublicCategory {
  _id: string;
  name: string;
  slug: string;
  imageUrl: string;
  children?: PublicCategory[];
}

export async function listCategoryTree(): Promise<PublicCategory[]> {
  const { data } = await httpClient.get<ApiResponse<PublicCategory[]>>('/categories');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
