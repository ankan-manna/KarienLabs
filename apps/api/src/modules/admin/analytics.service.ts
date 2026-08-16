import { PAYMENT_STATUS, PURCHASE_REQUEST_STATUS, RETURN_STATUS, ROLES } from '@medcommerce/shared';

import { UserModel } from '../auth/models/user.model';
import { batchRepository } from '../inventory/batch.repository';
import { PurchaseOrderModel } from '../inventory/models/purchase-order.model';
import { PurchaseRequestModel } from '../inventory/models/purchase-request.model';
import { OrderModel } from '../orders/models/order.model';
import { ReturnModel } from '../orders/models/return.model';

import { dateRangeMatchStage, type ResolvedDateRange } from './analytics-date-range.util';
import { distributorEnquiryReport } from './reports.service';

/** Prompt 22 Part 4/5 — see reports.service.ts's identical comment; same shared resolver, no more locally-duplicated date logic. */
type DateRange = ResolvedDateRange;

const dateMatch = dateRangeMatchStage;

/**
 * Prompt 22 Part 5 — explicit UTC "now" boundaries, replacing the previous
 * local-server-timezone `setHours(0,0,0,0)`/`setDate(1)` calls (a real bug:
 * those disagreed with the UTC-implicit `$dateToString` grouping used
 * elsewhere in this same file whenever the Node process wasn't running in
 * UTC — see analytics-date-range.util.ts's file-level comment).
 */
function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Consolidated KPI snapshot for the Analytics dashboard header — today/month revenue, order/customer counts, and pending-action counts. */
export async function dashboardSnapshot() {
  const today = startOfToday();
  const monthStart = startOfMonth();

  const [
    todayRevenueAgg,
    monthRevenueAgg,
    totalOrders,
    monthOrders,
    totalCustomers,
    lowStock,
    nearExpiry,
    pendingPurchaseRequests,
    pendingReturns,
  ] = await Promise.all([
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, createdAt: { $gte: today } } },
      { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' } } },
    ]),
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, createdAt: { $gte: monthStart } } },
      { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' } } },
    ]),
    OrderModel.countDocuments({}),
    OrderModel.countDocuments({ createdAt: { $gte: monthStart } }),
    UserModel.countDocuments({ role: ROLES.CUSTOMER }),
    batchRepository.findLowStock(),
    batchRepository.findNearExpiry(30),
    PurchaseRequestModel.countDocuments({ status: PURCHASE_REQUEST_STATUS.PENDING }),
    ReturnModel.countDocuments({ status: RETURN_STATUS.REQUESTED }),
  ]);

  return {
    todaysRevenue: todayRevenueAgg[0]?.revenue ?? 0,
    monthsRevenue: monthRevenueAgg[0]?.revenue ?? 0,
    totalOrders,
    monthOrders,
    totalCustomers,
    lowStockCount: lowStock.length,
    nearExpiryCount: nearExpiry.length,
    pendingPurchaseRequestCount: pendingPurchaseRequests,
    pendingReturnCount: pendingReturns,
  };
}

/** Top 10 products by revenue over a date range, with unitsSold also included. */
export async function topMedicines(range: DateRange) {
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
        unitsSold: { $sum: '$items.quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        productName: '$product.name',
        sku: '$product.sku',
        revenue: 1,
        unitsSold: 1,
      },
    },
  ]);
  return rows;
}

/** Re-exposes the existing low-stock aggregation from batch.repository — no duplicated logic. */
export async function lowStockAlerts() {
  return batchRepository.findLowStock();
}

/** Top 10 suppliers by total PurchaseOrder value over a date range. */
export async function topSuppliers(range: DateRange) {
  const rows = await PurchaseOrderModel.aggregate([
    { $match: dateMatch(range) },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$_id',
        supplierId: { $first: '$supplierId' },
        value: { $sum: { $multiply: ['$items.quantityOrdered', '$items.unitCost'] } },
      },
    },
    {
      $group: {
        _id: '$supplierId',
        totalOrders: { $sum: 1 },
        totalValue: { $sum: '$value' },
      },
    },
    { $sort: { totalValue: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
    { $unwind: '$supplier' },
    {
      $project: {
        _id: 0,
        supplierId: '$_id',
        supplierName: '$supplier.name',
        totalOrders: 1,
        totalValue: 1,
      },
    },
  ]);
  return rows;
}

/** Time-series of order revenue grouped by day or month, for the Analytics revenue-trend chart. */
export async function revenueTrend(range: DateRange, period: 'daily' | 'monthly') {
  const format = period === 'monthly' ? '%Y-%m' : '%Y-%m-%d';
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, revenue: r.revenue, orderCount: r.orderCount }));
}

/** Total customers, new customers this month, repeat-purchase rate, and top 10 customers by lifetime spend. */
export async function customerInsights() {
  const monthStart = startOfMonth();

  const [totalCustomers, newCustomersThisMonth, spendByCustomer, topCustomersAgg] = await Promise.all([
    UserModel.countDocuments({ role: ROLES.CUSTOMER }),
    UserModel.countDocuments({ role: ROLES.CUSTOMER, createdAt: { $gte: monthStart } }),
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
      { $group: { _id: '$customerId', orders: { $sum: 1 } } },
      {
        $group: {
          _id: null,
          totalBuyers: { $sum: 1 },
          repeatBuyers: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } },
        },
      },
    ]),
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
      { $group: { _id: '$customerId', totalSpent: { $sum: '$totals.grandTotal' } } },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          name: '$customer.name',
          email: '$customer.email',
          totalSpent: 1,
        },
      },
    ]),
  ]);

  const totalBuyers = spendByCustomer[0]?.totalBuyers ?? 0;
  const repeatBuyers = spendByCustomer[0]?.repeatBuyers ?? 0;

  return {
    totalCustomers,
    newCustomersThisMonth,
    repeatPurchaseRate: totalBuyers ? (repeatBuyers / totalBuyers) * 100 : 0,
    topCustomers: topCustomersAgg,
  };
}

/**
 * Prompt 34 Part 22/40 — dashboard-card-sized Distributor/Bulk Purchase
 * enquiry summary for the Analytics page. Reuses reports.service.ts's
 * `distributorEnquiryReport` aggregation rather than duplicating it (Part
 * 49's "avoid duplicate logic"), but strips the per-enquiry `rows` (which
 * carry contact PII — email/mobile/company) since a dashboard KPI card has
 * no reason to receive raw contact records; only the full Export flow reads
 * `rows`, gated by the same RBAC as this endpoint either way.
 */
export async function distributorEnquirySummary(range: DateRange) {
  const report = await distributorEnquiryReport(range);
  return {
    totalEnquiries: report.totalEnquiries,
    statusBreakdown: report.statusBreakdown,
    conversionRatePercent: report.conversionRatePercent,
    topRequestedSkus: report.topRequestedSkus,
  };
}
