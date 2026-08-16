import { Router } from 'express';

import { adminApiRateLimiter } from '../middlewares/rate-limit.middleware';
import { analyticsRouter } from '../modules/admin/analytics.routes';
import { adminCustomersRouter } from '../modules/admin/customers.routes';
import { adminInvoicesRouter } from '../modules/admin/invoices.routes';
import { adminRouter } from '../modules/admin/logs.routes';
import { adminPaymentsRouter } from '../modules/admin/payments.routes';
import { publicAnalyticsRouter } from '../modules/admin/public-analytics.routes';
import { reportsRouter } from '../modules/admin/reports.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { rbacAdminRouter } from '../modules/auth/rbac-admin.routes';
import { brandRouter } from '../modules/catalog/brand.routes';
import { bundleRouter } from '../modules/catalog/bundle.routes';
import { categoryRouter } from '../modules/catalog/category.routes';
import { manufacturerRouter } from '../modules/catalog/manufacturer.routes';
import { productRouter } from '../modules/catalog/product.routes';
import { cmsRouter } from '../modules/cms/cms.routes';
import { publicCmsRouter } from '../modules/cms/public-cms.routes';
import { couponRouter } from '../modules/coupons/coupon.routes';
import { addressRouter } from '../modules/customers/address.routes';
import { cartRouter } from '../modules/customers/cart.routes';
import { prescriptionRouter } from '../modules/customers/prescription.routes';
import { profileRouter } from '../modules/customers/profile.routes';
import { savedMedicineRouter } from '../modules/customers/saved-medicine.routes';
import { wishlistRouter } from '../modules/customers/wishlist.routes';
import { deliveryRouter } from '../modules/delivery/delivery.routes';
import { distributorEnquiryAdminRouter } from '../modules/distributor-enquiries/distributor-enquiry-admin.routes';
import { distributorEnquiryRouter } from '../modules/distributor-enquiries/distributor-enquiry.routes';
import { filesRouter } from '../modules/files/files.routes';
import { batchRouter } from '../modules/inventory/batch.routes';
import { damagedStockRouter } from '../modules/inventory/damaged-stock.routes';
import { grnRouter } from '../modules/inventory/grn.routes';
import { purchaseOrderRouter } from '../modules/inventory/purchase-order.routes';
import { purchaseRequestRouter } from '../modules/inventory/purchase-request.routes';
import { stockAdjustmentRouter } from '../modules/inventory/stock-adjustment.routes';
import { stockMovementRouter } from '../modules/inventory/stock-movement.routes';
import { stockTransferRouter } from '../modules/inventory/stock-transfer.routes';
import { supplierRouter } from '../modules/inventory/supplier.routes';
import { warehouseRouter } from '../modules/inventory/warehouse.routes';
import { invoiceRouter } from '../modules/invoices/invoice.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { orderRouter } from '../modules/orders/order.routes';
import { returnRouter } from '../modules/orders/return.routes';
import { shipmentRouter } from '../modules/orders/shipment.routes';
import { paymentsRouter } from '../modules/payments/payments.routes';
import { configurationRouter } from '../modules/platform/configuration.routes';
import { dynamicMenuRouter } from '../modules/platform/dynamic-menu.routes';
import { featureFlagRouter } from '../modules/platform/feature-flag.routes';
import { inventoryEventsRouter } from '../modules/realtime/inventory-events.routes';
import { reviewRouter } from '../modules/reviews/review.routes';
import { searchAdminRouter } from '../modules/search/search-admin.routes';
import { searchRouter } from '../modules/search/search.routes';
import { seoAdminRouter } from '../modules/search/seo-admin.routes';
import { securityRouter } from '../modules/security/security.routes';
import { sellerRouter } from '../modules/sellers/seller.routes';
import { taxRouter } from '../modules/tax/tax.routes';
import { uploadsRouter } from '../modules/uploads/uploads.routes';

export const v1Router = Router();

// Prompt 24 Part 2 — a broader-than-global per-actor ceiling on the WHOLE
// `/admin/*` surface, layered ahead of every admin sub-router mounted
// below (Express applies path-prefix middleware in registration order,
// so this runs for `/admin/rbac`, `/admin/reports`, `/admin/seo`, the
// generic `/admin` router, ... regardless of which one ultimately
// handles the request) — see rate-limit.middleware.ts for the full
// rationale. Does not replace any endpoint-specific limiter already
// applied deeper in an individual router.
v1Router.use('/admin', adminApiRateLimiter);

// Auth & RBAC
v1Router.use('/auth', authRouter);
v1Router.use('/admin/rbac', rbacAdminRouter);

// Catalog
v1Router.use('/categories', categoryRouter);
v1Router.use('/brands', brandRouter);
v1Router.use('/manufacturers', manufacturerRouter);
v1Router.use('/products', productRouter);
v1Router.use('/bundles', bundleRouter);

// Sellers (Prompt 11) — mounted alongside Inventory since Warehouse is the
// primary thing that references it, but Seller is its own top-level entity
// (also referenced by Order/Invoice), not nested under /warehouses.
v1Router.use('/sellers', sellerRouter);

// Inventory
v1Router.use('/warehouses', warehouseRouter);
v1Router.use('/suppliers', supplierRouter);
v1Router.use('/purchase-orders', purchaseOrderRouter);
v1Router.use('/purchase-requests', purchaseRequestRouter);
v1Router.use('/grn', grnRouter);
v1Router.use('/batches', batchRouter);
v1Router.use('/stock-adjustments', stockAdjustmentRouter);
v1Router.use('/stock-movements', stockMovementRouter);
v1Router.use('/stock-transfers', stockTransferRouter);
v1Router.use('/damaged-stock', damagedStockRouter);

// Customer self-service
v1Router.use('/profile', profileRouter);
v1Router.use('/addresses', addressRouter);
v1Router.use('/wishlist', wishlistRouter);
v1Router.use('/saved-medicines', savedMedicineRouter);
v1Router.use('/prescriptions', prescriptionRouter);
v1Router.use('/cart', cartRouter);
// Prompt 32 — public + optionally-authenticated Distributor/Bulk Purchase
// enquiry submission; deliberately its own router, never merged into any
// existing customer/contact surface (Part 59).
v1Router.use('/distributor-enquiries', distributorEnquiryRouter);

// Commerce
v1Router.use('/orders', orderRouter);
v1Router.use('/returns', returnRouter);
v1Router.use('/shipments', shipmentRouter);
v1Router.use('/payments', paymentsRouter);
v1Router.use('/invoices', invoiceRouter);
v1Router.use('/coupons', couponRouter);
v1Router.use('/reviews', reviewRouter);

// Platform / admin
v1Router.use('/admin/customers', adminCustomersRouter);
v1Router.use('/admin/distributor-enquiries', distributorEnquiryAdminRouter);
v1Router.use('/admin/payments', adminPaymentsRouter);
v1Router.use('/admin/invoices', adminInvoicesRouter);
v1Router.use('/admin/reports', reportsRouter);
v1Router.use('/admin/analytics', analyticsRouter);
v1Router.use('/admin/seo', seoAdminRouter);
v1Router.use('/admin/search', searchAdminRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/configuration', configurationRouter);
v1Router.use('/feature-flags', featureFlagRouter);
v1Router.use('/dynamic-menu', dynamicMenuRouter);
v1Router.use('/security', securityRouter);

// Delivery, tax, CMS, notifications
v1Router.use('/delivery', deliveryRouter);
v1Router.use('/tax', taxRouter);
v1Router.use('/cms', cmsRouter);
v1Router.use('/public/cms', publicCmsRouter);
// Prompt 34 Part 13/14/19 — anonymous-readable GA4 enablement check for
// the storefront's analytics loader, mirroring /public/cms's pattern.
v1Router.use('/public/analytics-config', publicAnalyticsRouter);
v1Router.use('/notifications', notificationsRouter);

// Files & search
v1Router.use('/uploads', uploadsRouter);
v1Router.use('/files', filesRouter);
v1Router.use('/search', searchRouter);

// Realtime (Prompt 3) — customer-safe inventory-change stream (SSE over Redis pub/sub)
v1Router.use('/realtime', inventoryEventsRouter);
