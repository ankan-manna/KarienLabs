import { ACTIONS, ANALYTICS_AUDIT_ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { logger } from '../../config/logger';
import { renderPdf } from '../../integrations/pdf/pdf.service';
import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { buildExcelBuffer, type ExcelColumn } from '../../utils/excel.util';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';

import { requireAnalyticsEnabled } from './analytics-config.middleware';
import type { AnalyticsConfig } from './analytics-config.util';
import { resolveAnalyticsDateRange, type ResolvedDateRange } from './analytics-date-range.util';
import * as reportsService from './reports.service';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, authorize(permission(RESOURCES.REPORTS, ACTIONS.READ)));

/**
 * Prompt 22 Part 4/5/43 — every date-ranged report resolves its window
 * through the ONE shared, UTC-consistent, abuse-protected resolver. A bad
 * `preset`/`from`/`to` throws an AppError(422, 'INVALID_DATE_RANGE', ...)
 * which asyncHandler forwards straight to the global error middleware.
 */
function rangeFromQuery(req: { query: Record<string, unknown> }): ResolvedDateRange {
  return resolveAnalyticsDateRange({
    preset: typeof req.query.preset === 'string' ? req.query.preset : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
}

/** Backs the `&format=pdf` option on report endpoints — same generic-report.hbs template regardless of which report called it, just a different column/row shape each time. */
async function renderReportPdf(title: string, columns: ExcelColumn[], rows: Record<string, unknown>[]) {
  return renderPdf('generic-report', {
    title,
    generatedAt: new Date().toLocaleString('en-IN'),
    columns: columns.map((c) => ({ header: c.header, key: c.key })),
    rows,
  });
}

async function respondReport<T extends Record<string, unknown>>(
  req: import('express').Request,
  res: import('express').Response,
  rows: T[],
  columns: ExcelColumn[],
  sheetName: string,
  format?: string,
) {
  if (format === 'excel' || format === 'pdf') {
    // Part 39 — bulk data extraction is the sensitive analytics-access case;
    // audited explicitly (routine JSON reads are covered by request logging
    // instead, see the mixin-based requestId/actorId auto-enrichment wired
    // in Prompt 18's config/logger.ts, to avoid flooding the audit log with
    // every dashboard refresh).
    await recordAudit({
      actorId: req.user!.id,
      actorType: actorTypeForRole(req.user!.role),
      action: ANALYTICS_AUDIT_ACTIONS.ANALYTICS_REPORT_EXPORTED,
      resource: 'analytics_report',
      resourceId: null,
      metadata: { reportName: sheetName, format, rowCount: rows.length },
    });
    logger.info(
      { reportName: sheetName, format, rowCount: rows.length, actorId: req.user!.id },
      'analytics report exported',
    );
  }
  if (format === 'excel') {
    const buffer = await buildExcelBuffer(sheetName, columns, rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${sheetName}-${Date.now()}.xlsx"`);
    return res.send(buffer);
  }
  if (format === 'pdf') {
    const buffer = await renderReportPdf(sheetName, columns, rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sheetName}-${Date.now()}.pdf"`);
    return res.send(buffer);
  }
  return sendSuccess(res, rows);
}

// Part 2/9/46/53 — Super Admin (always) / permitted Platform Admin (via
// `reports:update`) analytics-configuration surface. Deliberately mounted
// BEFORE the requireAnalyticsEnabled gates below and NOT itself gated by
// them — otherwise a disabled domain's toggle would be unreachable.
const canConfigure = authorize(permission(RESOURCES.REPORTS, ACTIONS.UPDATE));
reportsRouter.get(
  '/config',
  canConfigure,
  asyncHandler(async (_req, res) => {
    const { getAnalyticsConfig } = await import('./analytics-config.service');
    return sendSuccess(res, await getAnalyticsConfig());
  }),
);
reportsRouter.put(
  '/config',
  canConfigure,
  asyncHandler(async (req, res) => {
    const { setAnalyticsConfig } = await import('./analytics-config.service');
    const partial = req.body as Partial<AnalyticsConfig>;
    return sendSuccess(res, await setAnalyticsConfig(partial, req.user!.id, req.user!.role));
  }),
);

reportsRouter.get(
  '/sales',
  requireAnalyticsEnabled('salesAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.salesReport(rangeFromQuery(req));
    return respondReport(
      req,
      res,
      rows,
      [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Orders', key: 'orders', width: 10 },
        { header: 'Subtotal', key: 'subtotal', width: 14 },
        { header: 'GST', key: 'gst', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Shipping', key: 'shipping', width: 12 },
        { header: 'Revenue', key: 'revenue', width: 14 },
      ],
      'Sales Report',
      req.query.format as string,
    );
  }),
);

reportsRouter.get(
  '/inventory',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (_req, res) => sendSuccess(res, await reportsService.inventoryReport())),
);

reportsRouter.get(
  '/gst',
  requireAnalyticsEnabled('taxAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.gstReport(rangeFromQuery(req));
    return respondReport(
      req,
      res,
      rows,
      [
        { header: 'GST Rate (%)', key: 'gstRate', width: 14 },
        { header: 'Taxable Amount', key: 'taxableAmount', width: 16 },
        { header: 'GST Collected', key: 'gstCollected', width: 16 },
        { header: 'Units Sold', key: 'unitsSold', width: 12 },
      ],
      'GST Report',
      req.query.format as string,
    );
  }),
);

reportsRouter.get(
  '/payments',
  requireAnalyticsEnabled('paymentAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.paymentReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/customers',
  requireAnalyticsEnabled('customerAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.customerReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/coupons',
  requireAnalyticsEnabled('couponAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.couponReport();
    return respondReport(
      req,
      res,
      rows as unknown as Record<string, unknown>[],
      [
        { header: 'Code', key: 'code', width: 16 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Value', key: 'value', width: 10 },
        { header: 'Used', key: 'usageCount', width: 10 },
        { header: 'Limit', key: 'usageLimitGlobal', width: 10 },
        { header: 'Active', key: 'isActive', width: 10 },
      ],
      'Coupon Report',
      req.query.format as string,
    );
  }),
);

reportsRouter.get(
  '/warehouses',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.warehouseReport();
    return respondReport(
      req,
      res,
      rows as unknown as Record<string, unknown>[],
      [
        { header: 'Warehouse', key: 'warehouseName', width: 20 },
        { header: 'Code', key: 'warehouseCode', width: 12 },
        { header: 'Total Batches', key: 'totalBatches', width: 14 },
        { header: 'Total Stock Value', key: 'totalStockValue', width: 18 },
        { header: 'Low Stock Items', key: 'lowStockCount', width: 16 },
        { header: 'Near-Expiry Items', key: 'nearExpiryCount', width: 18 },
      ],
      'Warehouse Report',
      req.query.format as string,
    );
  }),
);

reportsRouter.get(
  '/purchases',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.purchaseReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/suppliers',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.supplierReport(rangeFromQuery(req));
    return respondReport(
      req,
      res,
      rows as unknown as Record<string, unknown>[],
      [
        { header: 'Supplier', key: 'supplierName', width: 20 },
        { header: 'Total Orders', key: 'totalOrders', width: 14 },
        { header: 'Total Value', key: 'totalValue', width: 16 },
        { header: 'Performance Rating', key: 'performanceRating', width: 18 },
      ],
      'Supplier Report',
      req.query.format as string,
    );
  }),
);

reportsRouter.get(
  '/expiry',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const days = typeof req.query.days === 'string' ? Number(req.query.days) || 30 : 30;
    return sendSuccess(res, await reportsService.expiryReport(days));
  }),
);

reportsRouter.get(
  '/orders',
  requireAnalyticsEnabled('orderAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.orderReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/invoices',
  requireAnalyticsEnabled('taxAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.invoiceReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/refunds',
  requireAnalyticsEnabled('refundAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.refundReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/returns',
  requireAnalyticsEnabled('returnAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const rows = await reportsService.returnReport(rangeFromQuery(req));
    return sendSuccess(res, rows);
  }),
);

reportsRouter.get(
  '/prescriptions',
  requireAnalyticsEnabled('prescriptionAnalyticsEnabled'),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await reportsService.prescriptionReport(rangeFromQuery(req))),
  ),
);

reportsRouter.get(
  '/shipments',
  requireAnalyticsEnabled('shippingAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.shipmentReport(rangeFromQuery(req)))),
);

reportsRouter.get(
  '/categories',
  requireAnalyticsEnabled('categoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await reportsService.categoryReport(rangeFromQuery(req)))),
);

/**
 * Prompt 34 Part 22/40 — Distributor/Bulk Purchase enquiry report. The
 * exportable Excel/PDF is the per-enquiry `rows` list; the JSON (no
 * `format`) response includes the full summary (statusBreakdown,
 * conversionRatePercent, topRequestedSkus) alongside `rows` for callers
 * that want both, since — unlike every report above — this is the only
 * one whose JSON shape also needs to answer the Analytics page's requests
 * that come with `format=excel|pdf` set from an explicit Export button.
 */
reportsRouter.get(
  '/distributor-enquiries',
  requireAnalyticsEnabled('distributorAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const report = await reportsService.distributorEnquiryReport(rangeFromQuery(req));
    const format = req.query.format as string;
    if (format === 'excel' || format === 'pdf') {
      return respondReport(
        req,
        res,
        report.rows,
        [
          { header: 'Enquiry No.', key: 'enquiryNumber', width: 16 },
          { header: 'Company', key: 'companyName', width: 22 },
          { header: 'Contact Person', key: 'contactPerson', width: 20 },
          { header: 'City', key: 'city', width: 16 },
          { header: 'State', key: 'state', width: 16 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Converted', key: 'converted', width: 12 },
          { header: 'Products Requested', key: 'requestedProductCount', width: 16 },
          { header: 'Total Qty Requested', key: 'requestedQuantityTotal', width: 18 },
          { header: 'Date', key: 'createdAt', width: 16 },
        ],
        'Distributor Enquiry Report',
        format,
      );
    }
    return sendSuccess(res, report);
  }),
);
