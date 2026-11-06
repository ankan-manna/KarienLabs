import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';
import type { AboutContent } from './public-cms.api';

export interface Banner {
  _id: string;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl: string;
  imageAlt: string;
  imagePublicId: string | null;
  linkUrl: string;
  ctaText: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  placement: 'hero' | 'category' | 'checkout' | 'offer';
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  slideDurationMs: number | null;
  isActive: boolean;
}

export const bannerApi = createCrudApi<Banner>('/cms/banners');

export interface HomeSection {
  _id: string;
  title: string;
  type: 'product_grid' | 'category_grid' | 'banner_carousel' | 'category_tabs';
  sourceType: 'manual' | 'category' | 'tag' | 'query';
  categoryIds?: string[];
  productIds?: string[];
  order: number;
  isActive: boolean;
}

export const homeSectionApi = createCrudApi<HomeSection>('/cms/home-sections');

export interface Faq {
  _id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  isActive: boolean;
}

export const faqApi = createCrudApi<Faq>('/cms/faqs');

export interface CmsPage {
  _id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
}

export const pageApi = createCrudApi<CmsPage>('/cms/pages');

export interface Blog {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  isPublished: boolean;
  publishedAt: string | null;
  tags: string[];
}

export const blogApi = createCrudApi<Blog>('/cms/blogs');

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

/** Singleton GET/PUT (not a list) — the homepage "About Us" teaser content. See about-content.routes.ts. */
export async function getAboutContent(): Promise<AboutContent> {
  const { data } = await httpClient.get<ApiResponse<AboutContent>>('/cms/about');
  return unwrap(data);
}

export async function setAboutContent(value: AboutContent): Promise<AboutContent> {
  const { data } = await httpClient.put<ApiResponse<AboutContent>>('/cms/about', value);
  return unwrap(data);
}
