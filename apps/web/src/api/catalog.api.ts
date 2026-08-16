import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  // Prompt 12 (CAT-06) — see product-defaults resolution on Product below.
  isExpirableDefault?: boolean;
  requiresPrescriptionDefault?: boolean;
  // Prompt 23 Part 15/18/28/29 — existed on the backend model since
  // Prompt 23 but was never surfaced in the admin type/form until now
  // (see CategorySeoFaqFields.tsx).
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string };
  faq?: { question: string; answer: string }[];
}

export interface Brand {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  isActive: boolean;
}

export interface Manufacturer {
  _id: string;
  name: string;
  slug: string;
  licenseNumber?: string;
  address?: string;
  isActive: boolean;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  brandId: string | null;
  basePrice: number;
  mrp: number;
  gstRate: number;
  // Prompt 30 — per-unit commercial shipping charge configured on the product.
  shippingCharge: number;
  reorderLevel: number;
  isActive: boolean;
  medicine?: {
    genericName?: string;
    // Tri-state (CAT-06) — null/undefined means "inherit from category".
    prescriptionRequired?: boolean | null;
    coldStorage?: boolean;
  };
  // Tri-state (CAT-06) — null/undefined means "inherit from category".
  expirable?: boolean | null;
  // Prompt 12 (CAT-03) — Shiprocket-required physical attributes.
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  barcode?: string | null;
  // Prompt 12 (CAT-05) — set automatically when a Bundle references this product.
  isBundle?: boolean;
  images: { url: string; publicId: string; isPrimary: boolean }[];
  // Prompt (Product Image Management) — server-derived from `images` (Part
  // 5/22); `mainImage` is `null` only for a product with zero images at all.
  mainImage: { url: string; publicId: string } | null;
  subImages: { url: string; publicId: string; sortOrder: number }[];
  createdAt: string;
  // Prompt 23 Part 13/18/40 — existed on the backend model since Prompt 12
  // but was never surfaced in the admin type/form until now.
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string };
  faq?: { question: string; answer: string }[];
}

export interface ProductInput {
  name: string;
  sku: string;
  categoryId: string;
  brandId?: string | null;
  basePrice: number;
  mrp: number;
  gstRate?: number;
  shippingCharge?: number;
  reorderLevel?: number;
  isActive?: boolean;
  medicine?: {
    genericName?: string;
    prescriptionRequired?: boolean | null;
    coldStorage?: boolean;
  };
  expirable?: boolean | null;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  barcode?: string | null;
}

const baseCategoryApi = createCrudApi<Category>('/categories');

/** `/categories` (base path) returns the nav tree for the storefront — the admin
 * CRUD table needs a flat, paginated, searchable list instead, served at
 * `/categories/flat`. Every other operation (create/update/remove/getById) is
 * unaffected and reuses the generic CRUD client as-is. */
export const categoryApi = {
  ...baseCategoryApi,
  list: async (params: ListQueryParams): Promise<{ items: Category[]; meta: PaginatedMeta }> => {
    const { data } = await httpClient.get<ApiResponse<Category[]>>('/categories/flat', { params });
    if (!data.success) throw new Error(data.error.message);
    return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
  },
};
export const brandApi = createCrudApi<Brand>('/brands');
export const manufacturerApi = createCrudApi<Manufacturer>('/manufacturers');
export const productApi = createCrudApi<Product, ProductInput, Partial<ProductInput>>('/products');

export async function bulkDeleteProducts(ids: string[]): Promise<void> {
  const { data } = await httpClient.post<ApiResponse<unknown>>('/products/bulk-delete', { ids });
  if (!data.success) throw new Error(data.error.message);
}

export interface ProductImageConfig {
  maxSubImages: number;
}

/** Part 4/28 — the backend-authoritative sub-image cap; any authenticated staff member can read it (not gated behind `configuration:read`, which only Super Admin holds), so a plain Admin's upload UI can enforce it too. */
export async function getProductImageConfig(): Promise<ProductImageConfig> {
  const { data } = await httpClient.get<ApiResponse<ProductImageConfig>>('/products/config/image-limits');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Sets or replaces the product's main image — the only way to change it (Part 18/19); the backend safely cleans up the previous Cloudinary asset after the DB write commits. */
export async function setMainProductImage(
  productId: string,
  image: { url: string; publicId: string },
) {
  const { data } = await httpClient.put<ApiResponse<Product>>(
    `/products/${productId}/images/main`,
    image,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Adds one sub/additional image. The backend rejects this once `maxSubImages` is reached — never trust the frontend cap alone (Part 27). */
export async function addSubProductImage(
  productId: string,
  image: { url: string; publicId: string },
) {
  const { data } = await httpClient.post<ApiResponse<Product>>(
    `/products/${productId}/images`,
    image,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Removes a sub image. The backend rejects removing the main image this way (Part 19) — use `setMainProductImage` to replace it instead. Cloudinary `publicId`s routinely contain `/` (folder paths), so it must be percent-encoded before going into the URL path — otherwise Express's `:publicId` param only captures the first segment and 404s. */
export async function removeSubProductImage(productId: string, publicId: string) {
  const { data } = await httpClient.delete<ApiResponse<Product>>(
    `/products/${productId}/images/${encodeURIComponent(publicId)}`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

/** Reorders the product's sub images (Part 18 — "reorder sub-images if practical"); `publicIds` must be the full, current set of sub-image ids in the desired order. */
export async function reorderSubProductImages(productId: string, publicIds: string[]) {
  const { data } = await httpClient.patch<ApiResponse<Product>>(
    `/products/${productId}/images/reorder`,
    { publicIds },
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
