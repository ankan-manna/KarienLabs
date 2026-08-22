import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface PublicBanner {
  _id: string;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  imageAlt: string;
  linkUrl: string;
  ctaText: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  placement: 'hero' | 'category' | 'checkout';
  order: number;
  slideDurationMs: number | null;
}

export interface PublicHomeSection {
  _id: string;
  title: string;
  type: 'product_grid' | 'category_grid' | 'banner_carousel';
  sourceType: 'manual' | 'category' | 'tag' | 'query';
  productIds: { _id: string; name: string; slug: string; basePrice: number; mrp: number; images: { url: string; isPrimary: boolean }[]; ratingAvg?: number; ratingCount?: number; inStock: boolean }[];
  categoryIds: { _id: string; name: string; slug: string }[];
  order: number;
}

export interface PublicFaq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
}

export interface PublicPage {
  _id: string;
  slug: string;
  title: string;
  content: string;
  seo?: { metaTitle?: string; metaDescription?: string };
}

export interface PublicBlogSummary {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string;
  tags: string[];
  publishedAt: string;
}

export interface PublicBlog extends PublicBlogSummary {
  content: string;
  authorId?: { name: string } | string;
  seo?: { metaTitle?: string; metaDescription?: string };
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function getPublicBanners(placement?: string): Promise<PublicBanner[]> {
  const { data } = await httpClient.get<ApiResponse<PublicBanner[]>>('/public/cms/banners', {
    params: placement ? { placement } : undefined,
  });
  return unwrap(data);
}

export async function getPublicHomeSections(): Promise<PublicHomeSection[]> {
  const { data } = await httpClient.get<ApiResponse<PublicHomeSection[]>>('/public/cms/home-sections');
  return unwrap(data);
}

export async function getPublicFaqs(category?: string): Promise<PublicFaq[]> {
  const { data } = await httpClient.get<ApiResponse<PublicFaq[]>>('/public/cms/faqs', {
    params: category ? { category } : undefined,
  });
  return unwrap(data);
}

export async function getPublicPage(slug: string): Promise<PublicPage> {
  const { data } = await httpClient.get<ApiResponse<PublicPage>>(`/public/cms/pages/${slug}`);
  return unwrap(data);
}

export async function listPublicBlogs(
  params: ListQueryParams = {},
): Promise<{ items: PublicBlogSummary[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PublicBlogSummary[]>>('/public/cms/blogs', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getPublicBlog(slug: string): Promise<PublicBlog> {
  const { data } = await httpClient.get<ApiResponse<PublicBlog>>(`/public/cms/blogs/${slug}`);
  return unwrap(data);
}

export interface SiteSettings {
  footer?: {
    companyDescription?: string;
    socialLinks?: {
      facebook?: string;
      twitter?: string;
      instagram?: string;
      linkedin?: string;
      youtube?: string;
    };
    quickLinks?: { label: string; path: string }[];
  };
  seo?: {
    defaultMetaTitle?: string;
    defaultMetaDescription?: string;
    defaultOgImage?: string;
    titleSuffix?: string;
  };
}

/**
 * Anonymous-readable site-wide settings (footer content + global SEO defaults),
 * stored under the 'cms' Configuration Engine namespace. Used by the public
 * Footer — callers should gracefully fall back to hardcoded defaults if this
 * ever errors, since it's on the critical render path of every storefront page.
 */
export async function getPublicSiteSettings(): Promise<SiteSettings> {
  const { data } = await httpClient.get<ApiResponse<SiteSettings>>('/public/cms/site-settings');
  return unwrap(data);
}
