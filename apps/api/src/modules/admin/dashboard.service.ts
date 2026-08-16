import { ORDER_STATUS, PAYMENT_STATUS, PRESCRIPTION_STATUS, ROLES } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ActivityLogModel } from '../audit/models/activity-log.model';
import { AuditLogModel } from '../audit/models/audit-log.model';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';
import { UserModel } from '../auth/models/user.model';
import { ProductModel } from '../catalog/models/product.model';
import { PrescriptionUploadModel } from '../customers/models/prescription-upload.model';
import { batchRepository } from '../inventory/batch.repository';
import { BatchModel } from '../inventory/models/batch.model';
import { NotificationHistoryModel } from '../notifications/models/notification-history.model';
import { NotificationQueueModel } from '../notifications/models/notification-queue.model';
import { OrderModel } from '../orders/models/order.model';
import { PaymentModel } from '../payments/models/payment.model';

/**
 * Prompt 22 Part 5 — explicit UTC date math, replacing the previous
 * local-server-timezone `setHours`/`setDate`/`setMonth` mutation chain (a
 * real bug: it silently disagreed with the UTC-implicit `$dateToString`/
 * `$isoWeek` grouping used throughout this file whenever the Node process
 * ran in a non-UTC timezone). See analytics-date-range.util.ts for the
 * project-wide rationale for standardizing on UTC.
 */
function daysAgo(n: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n, 0, 0, 0, 0));
}

function monthsAgo(n: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1, 0, 0, 0, 0));
}

/** Revenue+order-count time series grouped by day, for the last `days` days (used for both the 14-day "daily sales" and 30-day "revenue graph" widgets — same query shape, different window). */
async function revenueByDay(days: number) {
  const since = daysAgo(days - 1);
  const rows = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since }, paymentStatus: PAYMENT_STATUS.CAPTURED } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, revenue: r.revenue, orderCount: r.orderCount }));
}

async function revenueByWeek(weeks: number) {
  const since = daysAgo(weeks * 7 - 1);
  const rows = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since }, paymentStatus: PAYMENT_STATUS.CAPTURED } },
    {
      $group: {
        _id: { isoWeek: { $isoWeek: '$createdAt' }, isoYear: { $isoWeekYear: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.isoYear': 1, '_id.isoWeek': 1 } },
  ]);
  return rows.map((r) => ({
    week: `${r._id.isoYear}-W${String(r._id.isoWeek).padStart(2, '0')}`,
    revenue: r.revenue,
    orderCount: r.orderCount,
  }));
}

async function revenueByMonth(months: number) {
  const since = monthsAgo(months - 1);
  const rows = await OrderModel.aggregate([
    { $match: { createdAt: { $gte: since }, paymentStatus: PAYMENT_STATUS.CAPTURED } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ month: r._id, revenue: r.revenue, orderCount: r.orderCount }));
}

async function customerGrowth(months: number) {
  const since = monthsAgo(months - 1);
  const rows = await UserModel.aggregate([
    { $match: { role: ROLES.CUSTOMER, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        newCustomers: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ month: r._id, newCustomers: r.newCustomers }));
}

/** Stock valuation grouped by category — the "inventory graph" widget. */
async function inventoryByCategory() {
  const rows = await BatchModel.aggregate([
    { $match: { deletedAt: null, quantityAvailable: { $gt: 0 } } },
    {
      $group: {
        _id: '$productId',
        totalQuantity: { $sum: '$quantityAvailable' },
        totalValue: { $sum: { $multiply: ['$quantityAvailable', '$unitCost'] } },
      },
    },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.categoryId',
        totalQuantity: { $sum: '$totalQuantity' },
        totalValue: { $sum: '$totalValue' },
      },
    },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        categoryName: { $ifNull: ['$category.name', 'Uncategorized'] },
        totalQuantity: 1,
        totalValue: 1,
      },
    },
    { $sort: { totalValue: -1 } },
    { $limit: 10 },
  ]);
  return rows;
}

async function topSellingProducts(limit = 5) {
  return OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        quantitySold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.amount' },
      },
    },
    { $sort: { quantitySold: -1 } },
    { $limit: limit },
  ]);
}

async function topCategories(limit = 5) {
  return OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.categoryId',
        revenue: { $sum: '$items.amount' },
        unitsSold: { $sum: '$items.quantity' },
      },
    },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        categoryName: { $ifNull: ['$category.name', 'Uncategorized'] },
        revenue: 1,
        unitsSold: 1,
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
}

async function topCustomers(limit = 5) {
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
    {
      $group: {
        _id: '$customerId',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$totals.grandTotal' },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        customerId: '$_id',
        name: '$user.name',
        email: '$user.email',
        orderCount: 1,
        totalSpent: 1,
      },
    },
  ]);
  return rows;
}

async function outOfStockCount() {
  const rows = await ProductModel.aggregate([
    { $match: { deletedAt: null, isActive: true } },
    {
      $lookup: {
        from: 'batches',
        let: { productId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$productId', '$$productId'] }, deletedAt: null } },
          { $group: { _id: null, total: { $sum: '$quantityAvailable' } } },
        ],
        as: 'stock',
      },
    },
    {
      $match: {
        $expr: { $eq: [{ $ifNull: [{ $first: '$stock.total' }, 0] }, 0] },
      },
    },
    { $count: 'count' },
  ]);
  return rows[0]?.count ?? 0;
}

/**
 * Computed live rather than read from the DashboardStatistic cache collection —
 * populating that cache on a schedule is background-job work (Prompt 9's
 * scheduling story); this gives correct numbers today at the cost of a few
 * aggregation queries per dashboard load, acceptable for admin-panel traffic.
 */
export async function getDashboardStats() {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  const [
    todayRevenueAgg,
    todayOrderCount,
    pendingOrderCount,
    deliveredOrderCount,
    cancelledOrderCount,
    refundRequestCount,
    lowStockItems,
    nearExpiryItems,
    outOfStock,
    pendingPrescriptions,
    latestOrders,
    latestPayments,
    recentActivity,
    recentNotifications,
    dailySales,
    weeklySales,
    monthlySales,
    revenueGraph,
    inventoryGraph,
    growth,
    topProducts,
    topCats,
    topCust,
  ] = await Promise.all([
    OrderModel.aggregate([
      { $match: { createdAt: { $gte: startOfDay }, paymentStatus: PAYMENT_STATUS.CAPTURED } },
      { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' } } },
    ]),
    OrderModel.countDocuments({ createdAt: { $gte: startOfDay } }),
    OrderModel.countDocuments({ status: ORDER_STATUS.PLACED }),
    OrderModel.countDocuments({ status: ORDER_STATUS.DELIVERED }),
    OrderModel.countDocuments({ status: ORDER_STATUS.CANCELLED }),
    OrderModel.countDocuments({ status: ORDER_STATUS.RETURNED, paymentStatus: { $ne: PAYMENT_STATUS.REFUNDED } }),
    batchRepository.findLowStock(),
    batchRepository.findNearExpiry(30),
    outOfStockCount(),
    PrescriptionUploadModel.countDocuments({ status: PRESCRIPTION_STATUS.PENDING }),
    OrderModel.find().sort({ createdAt: -1 }).limit(10).select('orderNumber customerId status paymentStatus totals createdAt').lean(),
    PaymentModel.find().sort({ createdAt: -1 }).limit(10).select('orderId amount status method createdAt').lean(),
    ActivityLogModel.find().sort({ createdAt: -1 }).limit(10).lean(),
    NotificationHistoryModel.find().sort({ sentAt: -1 }).limit(10).lean(),
    revenueByDay(14),
    revenueByWeek(8),
    revenueByMonth(12),
    revenueByDay(30),
    inventoryByCategory(),
    customerGrowth(12),
    topSellingProducts(5),
    topCategories(5),
    topCustomers(5),
  ]);

  return {
    // Sales summary
    todaysRevenue: todayRevenueAgg[0]?.revenue ?? 0,
    todaysOrderCount: todayOrderCount,
    pendingOrderCount,
    deliveredOrderCount,
    cancelledOrderCount,
    refundRequestCount,

    // Inventory status
    lowStockCount: lowStockItems.length,
    lowStockItems: lowStockItems.slice(0, 10),
    expiringCount: nearExpiryItems.length,
    expiringItems: nearExpiryItems.slice(0, 10),
    outOfStockCount: outOfStock,
    pendingPrescriptionCount: pendingPrescriptions,

    // Rankings
    topSellingProducts: topProducts,
    topCategories: topCats,
    topCustomers: topCust,

    // Feeds
    latestOrders,
    latestPayments,
    recentActivity,
    recentNotifications,

    // Charts
    charts: {
      dailySales,
      weeklySales,
      monthlySales,
      revenueGraph,
      inventoryGraph,
      customerGrowth: growth,
    },
  };
}

const MONGOOSE_READY_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * The Super Admin Dashboard's platform-operations panel (spec: "Platform Health,
 * Total Tenants, Total Platform Admins, ... Queue Status, Failed Jobs, ... Audit
 * Summary"), kept as a separate function/endpoint from `getDashboardStats()`
 * above (the commerce-focused admin dashboard) since these are a different
 * audience (super admin platform ops) and a different refresh cadence.
 */
export async function getPlatformHealthStats() {
  // Lazy import avoids a require-cycle risk (queue.ts doesn't depend on this
  // module, but keeping BullMQ wiring out of the top-level import list here
  // means this function can be called even if Redis is briefly unavailable —
  // the queue-count calls below are individually try/caught).
  const { invoiceQueue, maintenanceQueue, notificationDispatchQueue } = await import(
    '../../queues/queue'
  );

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalAdmins,
    totalCustomers,
    totalOrders,
    totalRevenueAgg,
    activeSessionCount,
    onlineUserIds,
    queuedNotifications,
    failedNotifications,
    auditCountsLast24h,
    securityAlerts,
  ] = await Promise.all([
    UserModel.countDocuments({ role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] }, deletedAt: null }),
    UserModel.countDocuments({ role: ROLES.CUSTOMER, deletedAt: null }),
    OrderModel.countDocuments({}),
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED } },
      { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' } } },
    ]),
    RefreshTokenModel.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
    RefreshTokenModel.distinct('userId', { revokedAt: null, expiresAt: { $gt: new Date() } }),
    NotificationQueueModel.countDocuments({ status: 'queued' }),
    NotificationQueueModel.countDocuments({ status: 'failed' }),
    AuditLogModel.aggregate([
      { $match: { createdAt: { $gte: dayAgo } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    UserModel.countDocuments({
      $or: [{ isSuspended: true }, { lockedUntil: { $gt: new Date() } }],
      updatedAt: { $gte: dayAgo },
    }),
  ]);

  interface QueueHealth {
    name: string;
    failed: number;
    active: number;
    waiting: number;
    completed: number;
    error?: string;
  }

  const queueCounts: QueueHealth[] = await Promise.all(
    (
      [
        ['invoice-generation', invoiceQueue],
        ['maintenance', maintenanceQueue],
        ['notification-dispatch', notificationDispatchQueue],
      ] as [string, { getJobCounts: () => Promise<Record<string, number>> }][]
    ).map(async ([name, queue]) => {
      try {
        const counts = await queue.getJobCounts();
        return {
          name,
          failed: counts.failed ?? 0,
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          completed: counts.completed ?? 0,
        };
      } catch {
        return { name, failed: 0, active: 0, waiting: 0, completed: 0, error: 'unreachable' };
      }
    }),
  );

  return {
    platformHealth: {
      apiStatus: 'ok',
      databaseStatus: MONGOOSE_READY_STATES[mongoose.connection.readyState] ?? 'unknown',
      serverUptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    // Single-tenant today — this field exists so the Super Admin Dashboard's
    // "Total Tenants" widget has somewhere real to read from once multi-tenant
    // support (spec: "Future Ready") lands; no isolation work is implied by it.
    totalTenants: 1,
    totalPlatformAdmins: totalAdmins,
    totalCustomers,
    totalOrders,
    totalRevenue: totalRevenueAgg[0]?.revenue ?? 0,
    activeSessions: activeSessionCount,
    onlineUsers: onlineUserIds.length,
    queues: queueCounts,
    failedJobs: queueCounts.reduce((sum, q) => sum + q.failed, 0),
    notificationQueue: { queued: queuedNotifications, failed: failedNotifications },
    auditSummary: Object.fromEntries(auditCountsLast24h.map((row) => [row._id, row.count])),
    securityAlerts,
  };
}
