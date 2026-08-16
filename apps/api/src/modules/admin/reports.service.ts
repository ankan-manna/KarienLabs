import {
  DISTRIBUTOR_ENQUIRY_STATUS,
  INVOICE_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRESCRIPTION_STATUS,
  PURCHASE_ORDER_STATUS,
  REFUND_STATUS,
  RETURN_RESOLUTION_TYPE,
  RETURN_STATUS,
  ROLES,
  SHIPMENT_STATUS,
} from '@medcommerce/shared';

import { UserModel } from '../auth/models/user.model';
import { CouponModel } from '../coupons/models/coupon.model';
import { PrescriptionUploadModel } from '../customers/models/prescription-upload.model';
import { DistributorEnquiryModel } from '../distributor-enquiries/models/distributor-enquiry.model';
import { batchRepository } from '../inventory/batch.repository';
import { BatchModel } from '../inventory/models/batch.model';
import { PurchaseOrderModel } from '../inventory/models/purchase-order.model';
import { WarehouseModel } from '../inventory/models/warehouse.model';
import { InvoiceModel } from '../invoices/models/invoice.model';
import { OrderModel } from '../orders/models/order.model';
import { ReturnModel } from '../orders/models/return.model';
import { ShipmentModel } from '../orders/models/shipment.model';
import { PaymentModel } from '../payments/models/payment.model';
import { RefundModel } from '../payments/models/refund.model';

import { dateRangeMatchStage, type ResolvedDateRange } from './analytics-date-range.util';

/**
 * Prompt 22 Part 4/5/43 — every report below now takes an already-resolved,
 * always-bounded UTC range (see analytics-date-range.util.ts) instead of the
 * old ad-hoc `{from?, to?}` optional-string shape, which allowed a fully
 * unbounded ("all time") query whenever neither param was supplied and had
 * no protection against an absurdly wide custom range.
 */
type DateRange = ResolvedDateRange;

const dateMatch = dateRangeMatchStage;

/** Day-by-day revenue/order-count/GST breakdown over an arbitrary range — the base of the Sales Report screen. */
export async function salesReport(range: DateRange) {
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        subtotal: { $sum: '$totals.subtotal' },
        gst: { $sum: '$totals.gst' },
        discount: { $sum: '$totals.discount' },
        shipping: { $sum: '$totals.shipping' },
        revenue: { $sum: '$totals.grandTotal' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, ...r, _id: undefined }));
}

/** Current stock valuation + low-stock/near-expiry snapshot — the Inventory Report screen. */
export async function inventoryReport() {
  const [valuation, lowStock, nearExpiry] = await Promise.all([
    BatchModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$warehouseId',
          totalQuantity: { $sum: '$quantityAvailable' },
          totalValue: { $sum: { $multiply: ['$quantityAvailable', '$unitCost'] } },
        },
      },
      { $lookup: { from: 'warehouses', localField: '_id', foreignField: '_id', as: 'warehouse' } },
      { $unwind: '$warehouse' },
      {
        $project: {
          _id: 0,
          warehouseId: '$_id',
          warehouseName: '$warehouse.name',
          totalQuantity: 1,
          totalValue: 1,
        },
      },
    ]),
    batchRepository.findLowStock(),
    batchRepository.findNearExpiry(30),
  ]);
  return { valuation, lowStock, nearExpiry };
}

/** GST collected, grouped by rate — reconciles against the GstSetting/ProductTaxMapping config. */
export async function gstReport(range: DateRange) {
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.gstRate',
        taxableAmount: { $sum: '$items.amount' },
        gstCollected: {
          $sum: { $multiply: ['$items.amount', { $divide: ['$items.gstRate', 100] }] },
        },
        unitsSold: { $sum: '$items.quantity' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ gstRate: r._id, ...r, _id: undefined }));
}

export async function paymentReport(range: DateRange) {
  const rows = await PaymentModel.aggregate([
    { $match: dateMatch(range) },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);
  return rows.map((r) => ({ status: r._id, count: r.count, amountInPaise: r.amount }));
}

export async function customerReport(range: DateRange) {
  const [newCustomers, ordersByCustomer] = await Promise.all([
    UserModel.countDocuments({ role: ROLES.CUSTOMER, ...dateMatch(range, 'createdAt') }),
    OrderModel.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
      {
        $group: {
          _id: '$customerId',
          orders: { $sum: 1 },
          totalSpent: { $sum: '$totals.grandTotal' },
        },
      },
      { $group: { _id: null, activeCustomers: { $sum: 1 }, totalRevenue: { $sum: '$totalSpent' } } },
    ]),
  ]);
  return {
    newCustomers,
    activeCustomers: ordersByCustomer[0]?.activeCustomers ?? 0,
    totalRevenue: ordersByCustomer[0]?.totalRevenue ?? 0,
  };
}

export async function couponReport() {
  const coupons = await CouponModel.find({ deletedAt: null })
    .select('code type value usageCount usageLimitGlobal isActive validFrom validTo')
    .sort({ usageCount: -1 })
    .lean();
  return coupons;
}

/** Per-warehouse snapshot: batch count, stock value, and low-stock/near-expiry item counts — the Warehouse Report screen. */
export async function warehouseReport() {
  const [warehouses, valuation, lowStock, nearExpiry] = await Promise.all([
    WarehouseModel.find({ deletedAt: null }).select('name code').lean(),
    BatchModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$warehouseId',
          totalBatches: { $sum: 1 },
          totalStockValue: { $sum: { $multiply: ['$quantityAvailable', '$unitCost'] } },
        },
      },
    ]),
    batchRepository.findLowStock(),
    batchRepository.findNearExpiry(30),
  ]);

  const valuationMap = new Map(valuation.map((v) => [String(v._id), v]));
  const lowStockCounts = new Map<string, number>();
  for (const row of lowStock as { warehouseId: unknown }[]) {
    const key = String(row.warehouseId);
    lowStockCounts.set(key, (lowStockCounts.get(key) ?? 0) + 1);
  }
  const nearExpiryCounts = new Map<string, number>();
  for (const batch of nearExpiry as { warehouseId: unknown }[]) {
    const key = String(batch.warehouseId);
    nearExpiryCounts.set(key, (nearExpiryCounts.get(key) ?? 0) + 1);
  }

  return warehouses.map((w) => {
    const key = String(w._id);
    const v = valuationMap.get(key);
    return {
      warehouseId: w._id,
      warehouseName: w.name,
      warehouseCode: w.code,
      totalBatches: v?.totalBatches ?? 0,
      totalStockValue: v?.totalStockValue ?? 0,
      lowStockCount: lowStockCounts.get(key) ?? 0,
      nearExpiryCount: nearExpiryCounts.get(key) ?? 0,
    };
  });
}

/** Date-ranged purchasing activity: order/value totals, status breakdown, and the top 10 products by quantity purchased. */
export async function purchaseReport(range: DateRange) {
  const [summary, byStatus, topProducts] = await Promise.all([
    PurchaseOrderModel.aggregate([
      { $match: dateMatch(range) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          value: { $sum: { $multiply: ['$items.quantityOrdered', '$items.unitCost'] } },
        },
      },
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalValue: { $sum: '$value' } } },
    ]),
    PurchaseOrderModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PurchaseOrderModel.aggregate([
      { $match: dateMatch(range) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          quantityPurchased: { $sum: '$items.quantityOrdered' },
        },
      },
      { $sort: { quantityPurchased: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          productName: '$product.name',
          sku: '$product.sku',
          quantityPurchased: 1,
        },
      },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(PURCHASE_ORDER_STATUS).map((status) => [
      status,
      byStatus.find((r) => r._id === status)?.count ?? 0,
    ]),
  );

  return {
    totalOrders: summary[0]?.totalOrders ?? 0,
    totalValue: summary[0]?.totalValue ?? 0,
    statusBreakdown,
    topProducts,
  };
}

/** Date-ranged per-supplier rollup: order count, total value, and current performance rating (if set on the Supplier). */
export async function supplierReport(range: DateRange) {
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
    { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
    { $unwind: '$supplier' },
    {
      $project: {
        _id: 0,
        supplierId: '$_id',
        supplierName: '$supplier.name',
        totalOrders: 1,
        totalValue: 1,
        performanceRating: '$supplier.performanceRating',
      },
    },
    { $sort: { totalValue: -1 } },
  ]);
  return rows;
}

/** Expired (still in stock) and near-expiry (within `days`) batches, grouped by product+warehouse, with value at risk. */
export async function expiryReport(days: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const [expired, nearExpiry] = await Promise.all([
    BatchModel.aggregate([
      { $match: { deletedAt: null, expiryDate: { $lt: now }, quantityAvailable: { $gt: 0 } } },
      {
        $group: {
          _id: { productId: '$productId', warehouseId: '$warehouseId' },
          quantity: { $sum: '$quantityAvailable' },
          value: { $sum: { $multiply: ['$quantityAvailable', '$unitCost'] } },
        },
      },
      { $lookup: { from: 'products', localField: '_id.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'warehouses', localField: '_id.warehouseId', foreignField: '_id', as: 'warehouse' } },
      { $unwind: '$warehouse' },
      {
        $project: {
          _id: 0,
          productId: '$_id.productId',
          productName: '$product.name',
          warehouseId: '$_id.warehouseId',
          warehouseName: '$warehouse.name',
          quantity: 1,
          value: 1,
        },
      },
      { $sort: { value: -1 } },
    ]),
    BatchModel.aggregate([
      { $match: { deletedAt: null, expiryDate: { $gte: now, $lte: cutoff }, quantityAvailable: { $gt: 0 } } },
      {
        $group: {
          _id: { productId: '$productId', warehouseId: '$warehouseId' },
          quantity: { $sum: '$quantityAvailable' },
          value: { $sum: { $multiply: ['$quantityAvailable', '$unitCost'] } },
          nearestExpiry: { $min: '$expiryDate' },
        },
      },
      { $lookup: { from: 'products', localField: '_id.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'warehouses', localField: '_id.warehouseId', foreignField: '_id', as: 'warehouse' } },
      { $unwind: '$warehouse' },
      {
        $project: {
          _id: 0,
          productId: '$_id.productId',
          productName: '$product.name',
          warehouseId: '$_id.warehouseId',
          warehouseName: '$warehouse.name',
          quantity: 1,
          value: 1,
          nearestExpiry: 1,
        },
      },
      { $sort: { nearestExpiry: 1 } },
    ]),
  ]);

  const totalValueAtRisk =
    expired.reduce((sum: number, r: { value: number }) => sum + r.value, 0) +
    nearExpiry.reduce((sum: number, r: { value: number }) => sum + r.value, 0);

  return { expired, nearExpiry, totalValueAtRisk };
}

/** Date-ranged order lifecycle breakdown (dynamic over the full ORDER_STATUS enum), average order value, and a daily time series for charting. */
export async function orderReport(range: DateRange) {
  const [byStatus, byDay, totals] = await Promise.all([
    OrderModel.aggregate([{ $match: dateMatch(range) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    OrderModel.aggregate([
      { $match: dateMatch(range) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$totals.grandTotal' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    OrderModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: null, totalOrders: { $sum: 1 }, totalValue: { $sum: '$totals.grandTotal' } } },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(ORDER_STATUS).map((status) => [status, byStatus.find((r) => r._id === status)?.count ?? 0]),
  );

  const totalOrders = totals[0]?.totalOrders ?? 0;
  const totalValue = totals[0]?.totalValue ?? 0;

  return {
    totalOrders,
    statusBreakdown,
    averageOrderValue: totalOrders ? totalValue / totalOrders : 0,
    timeSeries: byDay.map((r) => ({ date: r._id, orders: r.orders, revenue: r.revenue })),
  };
}

/** Date-ranged invoice counts, GST collected (CGST+SGST+IGST), and breakdown by INVOICE_STATUS. */
export async function invoiceReport(range: DateRange) {
  const [byStatus, totals] = await Promise.all([
    InvoiceModel.aggregate([{ $match: dateMatch(range) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    InvoiceModel.aggregate([
      { $match: dateMatch(range) },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalGstCollected: {
            $sum: { $add: ['$gstBreakup.cgst', '$gstBreakup.sgst', '$gstBreakup.igst'] },
          },
        },
      },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(INVOICE_STATUS).map((status) => [status, byStatus.find((r) => r._id === status)?.count ?? 0]),
  );

  return {
    totalInvoices: totals[0]?.totalInvoices ?? 0,
    totalGstCollected: totals[0]?.totalGstCollected ?? 0,
    statusBreakdown,
  };
}

/** Date-ranged refund counts/amount and breakdown by REFUND_STATUS — safe on an empty collection. */
export async function refundReport(range: DateRange) {
  const [byStatus, totals] = await Promise.all([
    RefundModel.aggregate([{ $match: dateMatch(range) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    RefundModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: null, totalRefunds: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(REFUND_STATUS).map((status) => [status, byStatus.find((r) => r._id === status)?.count ?? 0]),
  );

  return {
    totalRefunds: totals[0]?.totalRefunds ?? 0,
    totalRefundAmount: totals[0]?.totalAmount ?? 0,
    statusBreakdown,
  };
}

/**
 * Date-ranged return-request counts, breakdown by RETURN_STATUS, the top 10
 * free-text return reasons, and — Prompt 22 Part 23 — a resolutionType
 * breakdown (refund vs. replacement) so replacement analytics doesn't need
 * a second, duplicate Return query: replacement orders ARE returns with
 * `resolutionType: 'replacement'`, there's no separate Replacement model.
 */
export async function returnReport(range: DateRange) {
  const [byStatus, totalReturns, topReasons, byResolutionType] = await Promise.all([
    ReturnModel.aggregate([{ $match: dateMatch(range) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ReturnModel.countDocuments(dateMatch(range)),
    ReturnModel.aggregate([
      { $match: dateMatch(range) },
      { $unwind: '$items' },
      { $group: { _id: '$items.reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    ReturnModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: '$resolutionType', count: { $sum: 1 } } },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(RETURN_STATUS).map((status) => [status, byStatus.find((r) => r._id === status)?.count ?? 0]),
  );

  const resolutionTypeBreakdown = Object.fromEntries(
    Object.values(RETURN_RESOLUTION_TYPE).map((type) => [
      type,
      byResolutionType.find((r) => r._id === type)?.count ?? 0,
    ]),
  );
  const pendingResolutionCount = byResolutionType.find((r) => r._id === null)?.count ?? 0;

  return {
    totalReturns,
    statusBreakdown,
    topReasons: topReasons.map((r) => ({ reason: r._id, count: r.count })),
    resolutionTypeBreakdown,
    pendingResolutionCount,
  };
}

/** Prompt 22 Part 24 — date-ranged prescription counts, breakdown by PRESCRIPTION_STATUS, and average admin turnaround time (upload -> verified/rejected) in hours. Never exposes the file itself (bucket/objectKey/cloudinaryPublicId) — counts and timestamps only. */
export async function prescriptionReport(range: DateRange) {
  const [byStatus, totals, turnaround] = await Promise.all([
    PrescriptionUploadModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PrescriptionUploadModel.countDocuments(dateMatch(range)),
    PrescriptionUploadModel.aggregate([
      {
        $match: {
          ...dateMatch(range),
          verifiedAt: { $ne: null },
          status: { $in: [PRESCRIPTION_STATUS.APPROVED, PRESCRIPTION_STATUS.REJECTED] },
        },
      },
      {
        $project: {
          turnaroundHours: { $divide: [{ $subtract: ['$verifiedAt', '$createdAt'] }, 1000 * 60 * 60] },
        },
      },
      { $group: { _id: null, avgTurnaroundHours: { $avg: '$turnaroundHours' } } },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(PRESCRIPTION_STATUS).map((status) => [
      status,
      byStatus.find((r) => r._id === status)?.count ?? 0,
    ]),
  );

  return {
    totalPrescriptions: totals,
    statusBreakdown,
    averageVerificationTurnaroundHours: turnaround[0]?.avgTurnaroundHours ?? 0,
  };
}

/** Prompt 22 Part 19/20 — date-ranged shipment counts, breakdown by SHIPMENT_STATUS, real average delivery duration (dispatchedAt -> deliveredAt, hours), and on-time-delivery rate against `estimatedDeliveryDate` — all derived from timestamps this codebase already records, no fabricated metric. */
export async function shipmentReport(range: DateRange) {
  const [byStatus, totals, deliveryStats] = await Promise.all([
    ShipmentModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ShipmentModel.countDocuments(dateMatch(range)),
    ShipmentModel.aggregate([
      {
        $match: {
          ...dateMatch(range),
          status: SHIPMENT_STATUS.DELIVERED,
          deliveredAt: { $ne: null },
          dispatchedAt: { $ne: null },
        },
      },
      {
        $project: {
          deliveryHours: { $divide: [{ $subtract: ['$deliveredAt', '$dispatchedAt'] }, 1000 * 60 * 60] },
          onTime: {
            $cond: [
              { $eq: ['$estimatedDeliveryDate', null] },
              null,
              { $lte: ['$deliveredAt', '$estimatedDeliveryDate'] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          deliveredCount: { $sum: 1 },
          avgDeliveryHours: { $avg: '$deliveryHours' },
          onTimeCount: { $sum: { $cond: [{ $eq: ['$onTime', true] }, 1, 0] } },
          knownEtaCount: { $sum: { $cond: [{ $eq: ['$onTime', null] }, 0, 1] } },
        },
      },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(SHIPMENT_STATUS).map((status) => [status, byStatus.find((r) => r._id === status)?.count ?? 0]),
  );

  const stats = deliveryStats[0];
  const onTimeDeliveryRatePercent =
    stats && stats.knownEtaCount > 0 ? (stats.onTimeCount / stats.knownEtaCount) * 100 : null;

  return {
    totalShipments: totals,
    statusBreakdown,
    averageDeliveryDurationHours: stats?.avgDeliveryHours ?? 0,
    // null (not 0) when no delivered shipment in range has a known ETA to compare against — distinguishes "no data" from "0% on-time".
    onTimeDeliveryRatePercent,
    failedOrRtoCount:
      (byStatus.find((r) => r._id === SHIPMENT_STATUS.FAILED)?.count ?? 0) +
      (byStatus.find((r) => r._id === SHIPMENT_STATUS.RTO)?.count ?? 0),
  };
}

/** Prompt 22 Part 14 — date-ranged category performance: revenue, units sold, and order count per category, derived from Order line items (never a second source of truth for catalog data — categoryName/Id come from the live `categories` collection via $lookup, sales figures from Order). */
export async function categoryReport(range: DateRange) {
  const rows = await OrderModel.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.CAPTURED, ...dateMatch(range) } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.categoryId',
        revenue: { $sum: '$items.amount' },
        unitsSold: { $sum: '$items.quantity' },
        orderCount: { $addToSet: '$_id' },
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
        orderCount: { $size: '$orderCount' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
  return rows;
}

/**
 * Prompt 34 Part 22/40 — date-ranged Distributor/Bulk Purchase enquiry
 * report: status breakdown, conversion status (Part 40 — "conversion
 * status" is read from the enquiry's OWN `status` field, e.g. `converted`,
 * never inferred from Order data; this module never joins to Orders,
 * consistent with distributor-enquiry.model.ts's isolation-by-design), and
 * the top 10 requested SKUs by total requested quantity. Read-only
 * aggregation — never writes to or converts an enquiry.
 */
interface DistributorEnquiryLeanRow {
  enquiryNumber: string;
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  city: string;
  state: string;
  status: string;
  contactVerified: boolean;
  requestedProducts: { requestedQuantity: number }[];
  createdAt: Date;
  resolvedAt: Date | null;
}

export async function distributorEnquiryReport(range: DateRange) {
  const [rows, byStatus, totalEnquiries, topSkus] = await Promise.all([
    DistributorEnquiryModel.find(dateMatch(range))
      .select(
        'enquiryNumber companyName contactPerson email mobile city state status contactVerified requestedProducts createdAt resolvedAt',
      )
      .sort({ createdAt: -1 })
      .lean() as unknown as Promise<DistributorEnquiryLeanRow[]>,
    DistributorEnquiryModel.aggregate([
      { $match: dateMatch(range) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    DistributorEnquiryModel.countDocuments(dateMatch(range)),
    DistributorEnquiryModel.aggregate([
      { $match: dateMatch(range) },
      { $unwind: '$requestedProducts' },
      {
        $group: {
          _id: '$requestedProducts.skuSnapshot',
          productName: { $first: '$requestedProducts.nameSnapshot' },
          totalRequestedQuantity: { $sum: '$requestedProducts.requestedQuantity' },
          enquiryCount: { $sum: 1 },
        },
      },
      { $sort: { totalRequestedQuantity: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          sku: '$_id',
          productName: 1,
          totalRequestedQuantity: 1,
          enquiryCount: 1,
        },
      },
    ]),
  ]);

  const statusBreakdown = Object.fromEntries(
    Object.values(DISTRIBUTOR_ENQUIRY_STATUS).map((status) => [
      status,
      byStatus.find((r) => r._id === status)?.count ?? 0,
    ]),
  );

  const convertedCount = statusBreakdown[DISTRIBUTOR_ENQUIRY_STATUS.CONVERTED] ?? 0;

  return {
    totalEnquiries,
    statusBreakdown,
    conversionRatePercent: totalEnquiries ? (convertedCount / totalEnquiries) * 100 : 0,
    topRequestedSkus: topSkus,
    rows: rows.map((r) => ({
      enquiryNumber: r.enquiryNumber,
      companyName: r.companyName,
      contactPerson: r.contactPerson,
      email: r.email,
      mobile: r.mobile,
      city: r.city,
      state: r.state,
      status: r.status,
      converted: r.status === DISTRIBUTOR_ENQUIRY_STATUS.CONVERTED,
      contactVerified: r.contactVerified,
      requestedProductCount: r.requestedProducts.length,
      requestedQuantityTotal: r.requestedProducts.reduce(
        (sum, p) => sum + p.requestedQuantity,
        0,
      ),
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    })),
  };
}
