import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

interface DateRange {
  preset?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}

/* 22 Part 4 — mirrors analytics-date-range.util.ts's DATE_RANGE_PRESETS exactly; kept as a plain array (not imported from @medcommerce/shared) since this is a report-screen-only UI concern, not a shared domain constant every module needs. */
export const DATE_RANGE_PRESET_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
  { value: 'currentMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'currentYear', label: 'This Year' },
  { value: 'previousYear', label: 'Previous Year' },
  { value: 'custom', label: 'Custom Range' },
] as const;

async function fetchReport<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const { data } = await httpClient.get<ApiResponse<T>>(path, { params });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface SalesReportRow {
  date: string;
  orders: number;
  subtotal: number;
  gst: number;
  discount: number;
  shipping: number;
  revenue: number;
}
export const fetchSalesReport = (range: DateRange) =>
  fetchReport<SalesReportRow[]>('/admin/reports/sales', range);

export interface InventoryReportData {
  valuation: { warehouseId: string; warehouseName: string; totalQuantity: number; totalValue: number }[];
  lowStock: unknown[];
  nearExpiry: unknown[];
}
export const fetchInventoryReport = () => fetchReport<InventoryReportData>('/admin/reports/inventory', {});

export interface GstReportRow {
  gstRate: number;
  taxableAmount: number;
  gstCollected: number;
  unitsSold: number;
}
export const fetchGstReport = (range: DateRange) =>
  fetchReport<GstReportRow[]>('/admin/reports/gst', range);

export interface PaymentReportRow {
  status: string;
  count: number;
  amountInPaise: number;
}
export const fetchPaymentReport = (range: DateRange) =>
  fetchReport<PaymentReportRow[]>('/admin/reports/payments', range);

export interface CustomerReportData {
  newCustomers: number;
  activeCustomers: number;
  totalRevenue: number;
}
export const fetchCustomerReport = (range: DateRange) =>
  fetchReport<CustomerReportData>('/admin/reports/customers', range);

export interface CouponReportRow {
  code: string;
  type: string;
  value: number;
  usageCount: number;
  usageLimitGlobal: number | null;
  isActive: boolean;
}
export const fetchCouponReport = () => fetchReport<CouponReportRow[]>('/admin/reports/coupons', {});

export interface WarehouseReportRow {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  totalBatches: number;
  totalStockValue: number;
  lowStockCount: number;
  nearExpiryCount: number;
}
export const fetchWarehouseReport = () => fetchReport<WarehouseReportRow[]>('/admin/reports/warehouses', {});

export interface PurchaseReportData {
  totalOrders: number;
  totalValue: number;
  statusBreakdown: Record<string, number>;
  topProducts: { productId: string; productName: string; sku: string; quantityPurchased: number }[];
}
export const fetchPurchaseReport = (range: DateRange) =>
  fetchReport<PurchaseReportData>('/admin/reports/purchases', range);

export interface SupplierReportRow {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  totalValue: number;
  performanceRating: number | null;
}
export const fetchSupplierReport = (range: DateRange) =>
  fetchReport<SupplierReportRow[]>('/admin/reports/suppliers', range);

export interface ExpiryReportRow {
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  value: number;
  nearestExpiry?: string;
}
export interface ExpiryReportData {
  expired: ExpiryReportRow[];
  nearExpiry: ExpiryReportRow[];
  totalValueAtRisk: number;
}
export const fetchExpiryReport = (days: number) =>
  fetchReport<ExpiryReportData>('/admin/reports/expiry', { days });

export interface OrderReportData {
  totalOrders: number;
  statusBreakdown: Record<string, number>;
  averageOrderValue: number;
  timeSeries: { date: string; orders: number; revenue: number }[];
}
export const fetchOrderReport = (range: DateRange) =>
  fetchReport<OrderReportData>('/admin/reports/orders', range);

export interface InvoiceReportData {
  totalInvoices: number;
  totalGstCollected: number;
  statusBreakdown: Record<string, number>;
}
export const fetchInvoiceReport = (range: DateRange) =>
  fetchReport<InvoiceReportData>('/admin/reports/invoices', range);

export interface RefundReportData {
  totalRefunds: number;
  totalRefundAmount: number;
  statusBreakdown: Record<string, number>;
}
export const fetchRefundReport = (range: DateRange) =>
  fetchReport<RefundReportData>('/admin/reports/refunds', range);

export interface ReturnReportData {
  totalReturns: number;
  statusBreakdown: Record<string, number>;
  topReasons: { reason: string; count: number }[];
  resolutionTypeBreakdown: Record<string, number>;
  pendingResolutionCount: number;
}
export const fetchReturnReport = (range: DateRange) =>
  fetchReport<ReturnReportData>('/admin/reports/returns', range);

/** Part 24 */
export interface PrescriptionReportData {
  totalPrescriptions: number;
  statusBreakdown: Record<string, number>;
  averageVerificationTurnaroundHours: number;
}
export const fetchPrescriptionReport = (range: DateRange) =>
  fetchReport<PrescriptionReportData>('/admin/reports/prescriptions', range);

/** Part 19/20 */
export interface ShipmentReportData {
  totalShipments: number;
  statusBreakdown: Record<string, number>;
  averageDeliveryDurationHours: number;
  onTimeDeliveryRatePercent: number | null;
  failedOrRtoCount: number;
}
export const fetchShipmentReport = (range: DateRange) =>
  fetchReport<ShipmentReportData>('/admin/reports/shipments', range);

/** Part 14 */
export interface CategoryReportRow {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  unitsSold: number;
  orderCount: number;
}
export const fetchCategoryReport = (range: DateRange) =>
  fetchReport<CategoryReportRow[]>('/admin/reports/categories', range);

export async function exportReportExcel(path: string, range: DateRange): Promise<Blob> {
  const { data } = await httpClient.get(path, { params: { ...range, format: 'excel' }, responseType: 'blob' });
  return data as Blob;
}

export async function exportReportPdf(path: string, range: DateRange): Promise<Blob> {
  const { data } = await httpClient.get(path, { params: { ...range, format: 'pdf' }, responseType: 'blob' });
  return data as Blob;
}

/** Part 2/9/46/53 — analytics per-domain Configuration, GET/PUT `/admin/reports/config`. */
export interface AnalyticsConfig {
  analyticsEnabled: boolean;
  salesAnalyticsEnabled: boolean;
  orderAnalyticsEnabled: boolean;
  customerAnalyticsEnabled: boolean;
  productAnalyticsEnabled: boolean;
  categoryAnalyticsEnabled: boolean;
  inventoryAnalyticsEnabled: boolean;
  paymentAnalyticsEnabled: boolean;
  shippingAnalyticsEnabled: boolean;
  returnAnalyticsEnabled: boolean;
  refundAnalyticsEnabled: boolean;
  prescriptionAnalyticsEnabled: boolean;
  couponAnalyticsEnabled: boolean;
  taxAnalyticsEnabled: boolean;
  distributorAnalyticsEnabled: boolean;
  googleAnalyticsEnabled: boolean;
  platformHealthAnalyticsEnabled: boolean;
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  const { data } = await httpClient.get<ApiResponse<AnalyticsConfig>>('/admin/reports/config');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function setAnalyticsConfig(partial: Partial<AnalyticsConfig>): Promise<AnalyticsConfig> {
  const { data } = await httpClient.put<ApiResponse<AnalyticsConfig>>('/admin/reports/config', partial);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
