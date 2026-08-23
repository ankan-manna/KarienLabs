import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

interface DateRange {
  from?: string;
  to?: string;
}

async function fetchAnalytics<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const { data } = await httpClient.get<ApiResponse<T>>(path, { params });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface DashboardSnapshot {
  todaysRevenue: number;
  monthsRevenue: number;
  totalOrders: number;
  monthOrders: number;
  totalCustomers: number;
  lowStockCount: number;
  nearExpiryCount: number;
  pendingPurchaseRequestCount: number;
  pendingReturnCount: number;
}
export const fetchDashboardSnapshot = () =>
  fetchAnalytics<DashboardSnapshot>('/admin/analytics/dashboard', {});

export interface TopMedicineRow {
  productId: string;
  productName: string;
  sku: string;
  revenue: number;
  unitsSold: number;
}
export const fetchTopMedicines = (range: DateRange) =>
  fetchAnalytics<TopMedicineRow[]>('/admin/analytics/top-medicines', { ...range });

export interface LowStockAlertRow {
  productId: string;
  warehouseId: string;
  totalAvailable: number;
  productName: string;
  sku: string;
  reorderLevel: number;
}
export const fetchLowStockAlerts = () =>
  fetchAnalytics<LowStockAlertRow[]>('/admin/analytics/low-stock', {});

export interface TopSupplierRow {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  totalValue: number;
}
export const fetchTopSuppliers = (range: DateRange) =>
  fetchAnalytics<TopSupplierRow[]>('/admin/analytics/top-suppliers', { ...range });

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  orderCount: number;
}
export const fetchRevenueTrend = (range: DateRange, period: 'daily' | 'monthly') =>
  fetchAnalytics<RevenueTrendPoint[]>('/admin/analytics/revenue-trend', { ...range, period });

export interface CustomerInsights {
  totalCustomers: number;
  newCustomersThisMonth: number;
  repeatPurchaseRate: number;
  topCustomers: { customerId: string; name: string; email: string; totalSpent: number }[];
}
export const fetchCustomerInsights = () =>
  fetchAnalytics<CustomerInsights>('/admin/analytics/customer-insights', {});

/** Part 22/40 — Distributor/Bulk Purchase enquiry KPIs for the Analytics page's new section. */
export interface DistributorEnquirySummary {
  totalEnquiries: number;
  statusBreakdown: Record<string, number>;
  conversionRatePercent: number;
  topRequestedSkus: { sku: string; productName: string; totalRequestedQuantity: number; enquiryCount: number }[];
}
export const fetchDistributorEnquirySummary = (range: DateRange) =>
  fetchAnalytics<DistributorEnquirySummary>('/admin/analytics/distributor-enquiries', { ...range });
