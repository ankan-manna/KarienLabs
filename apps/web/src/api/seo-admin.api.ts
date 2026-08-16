import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

/** Prompt 23 Part 16/17/19/36 — the `seo` Configuration namespace shape, mirrored from apps/api/src/modules/search/seo-config.util.ts. */
export interface SeoConfig {
  seoEnabled: boolean;
  productSeoEnabled: boolean;
  categorySeoEnabled: boolean;
  sitemapEnabled: boolean;
  robotsEnabled: boolean;
  structuredDataEnabled: boolean;
  canonicalEnabled: boolean;
  aeoEnabled: boolean;
  geoEnabled: boolean;
  siteTitle: string;
  siteDescription: string;
  defaultOgImage: string;
  canonicalBaseUrl: string;
  searchMinLength: number;
  searchMaxLength: number;
  searchMaxResults: number;
  suggestionLimit: number;
  searchCacheDurationSeconds: number;
}

export async function getSeoConfig(): Promise<SeoConfig> {
  const { data } = await httpClient.get<ApiResponse<SeoConfig>>('/admin/seo/config');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function setSeoConfig(partial: Partial<SeoConfig>): Promise<SeoConfig> {
  const { data } = await httpClient.patch<ApiResponse<SeoConfig>>('/admin/seo/config', partial);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface PopularSearchRow {
  query: string;
  count: number;
  hasResults: boolean;
  avgResultCount: number;
}

export interface ZeroResultSearchRow {
  query: string;
  count: number;
  lastSeenAt: string;
}

export interface SearchTrendRow {
  date: string;
  totalSearches: number;
  zeroResultSearches: number;
}

export interface SearchAnalyticsSummary {
  totalSearches: number;
  zeroResultSearches: number;
  distinctQueryCount: number;
}

interface DateRangeParams {
  preset?: string;
  from?: string;
  to?: string;
}

async function fetchAdmin<T>(path: string, params: DateRangeParams): Promise<T> {
  const { data } = await httpClient.get<ApiResponse<T>>(path, { params });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export const fetchSearchSummary = (range: DateRangeParams) =>
  fetchAdmin<SearchAnalyticsSummary>('/admin/search/analytics/summary', range);
export const fetchPopularSearches = (range: DateRangeParams) =>
  fetchAdmin<PopularSearchRow[]>('/admin/search/analytics/popular', range);
export const fetchZeroResultSearches = (range: DateRangeParams) =>
  fetchAdmin<ZeroResultSearchRow[]>('/admin/search/analytics/zero-result', range);
export const fetchSearchTrend = (range: DateRangeParams) =>
  fetchAdmin<SearchTrendRow[]>('/admin/search/analytics/trend', range);
