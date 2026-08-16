import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { Spinner } from '../components/common/Spinner';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { CustomerLayout } from '../layouts/CustomerLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { SuperAdminLayout } from '../layouts/SuperAdminLayout';
import { initAnalytics, trackPageView } from '../lib/analytics';

import { ProtectedRoute } from './ProtectedRoute';

// Auth
const LoginPage = lazy(() => import('../modules/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('../modules/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../modules/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../modules/auth/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../modules/auth/pages/VerifyEmailPage'));
const GoogleCallbackPage = lazy(() => import('../modules/auth/pages/GoogleCallbackPage'));

// Storefront
const HomePage = lazy(() => import('../modules/storefront/pages/HomePage'));
const ProductListPage = lazy(() => import('../modules/storefront/pages/ProductListPage'));
const ProductDetailPage = lazy(() => import('../modules/storefront/pages/ProductDetailPage'));
const SearchResultsPage = lazy(() => import('../modules/storefront/pages/SearchResultsPage'));
const CartPage = lazy(() => import('../modules/storefront/pages/CartPage'));
const CheckoutPage = lazy(() => import('../modules/storefront/pages/CheckoutPage'));

// Public content (CMS-driven)
const AboutPage = lazy(() => import('../modules/storefront/pages/AboutPage'));
const ContactPage = lazy(() => import('../modules/storefront/pages/ContactPage'));
// Prompt 32 — standalone Distributor/Bulk Purchase enquiry page, deliberately
// separate from ContactPage above (Part 59: never merged into Contact Us).
const BulkPurchasePage = lazy(() => import('../modules/storefront/pages/BulkPurchasePage'));
const FaqPage = lazy(() => import('../modules/storefront/pages/FaqPage'));
const PrivacyPolicyPage = lazy(() => import('../modules/storefront/pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('../modules/storefront/pages/TermsPage'));
const ReturnPolicyPage = lazy(() => import('../modules/storefront/pages/ReturnPolicyPage'));
const ShippingPolicyPage = lazy(() => import('../modules/storefront/pages/ShippingPolicyPage'));
const CancellationPolicyPage = lazy(
  () => import('../modules/storefront/pages/CancellationPolicyPage'),
);
const RefundPolicyPage = lazy(() => import('../modules/storefront/pages/RefundPolicyPage'));
const BlogListPage = lazy(() => import('../modules/storefront/pages/BlogListPage'));
const BlogDetailPage = lazy(() => import('../modules/storefront/pages/BlogDetailPage'));
const OffersPage = lazy(() => import('../modules/storefront/pages/OffersPage'));
const PublicBrandsPage = lazy(() => import('../modules/storefront/pages/BrandsPage'));
const PublicManufacturersPage = lazy(() => import('../modules/storefront/pages/ManufacturersPage'));
const GenericCmsPage = lazy(() => import('../modules/storefront/pages/GenericCmsPage'));

// Customer account
const CustomerDashboardPage = lazy(() => import('../modules/customer/pages/DashboardPage'));
const ProfilePage = lazy(() => import('../modules/customer/pages/ProfilePage'));
const AddressesPage = lazy(() => import('../modules/customer/pages/AddressesPage'));
const CustomerOrdersPage = lazy(() => import('../modules/customer/pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('../modules/customer/pages/OrderDetailPage'));
const WishlistPage = lazy(() => import('../modules/customer/pages/WishlistPage'));
const InvoicesPage = lazy(() => import('../modules/customer/pages/InvoicesPage'));
const PrescriptionsPage = lazy(() => import('../modules/customer/pages/PrescriptionsPage'));
const MyReviewsPage = lazy(() => import('../modules/customer/pages/MyReviewsPage'));
const MyCouponsPage = lazy(() => import('../modules/customer/pages/MyCouponsPage'));
const MyNotificationsPage = lazy(() => import('../modules/customer/pages/MyNotificationsPage'));

// Admin
const AdminDashboardPage = lazy(() => import('../modules/admin/dashboard/pages/DashboardPage'));
const AdminProductsPage = lazy(() => import('../modules/admin/catalog/pages/ProductsPage'));
const AdminBundlesPage = lazy(() => import('../modules/admin/catalog/pages/BundlesPage'));
const AdminCategoriesPage = lazy(() => import('../modules/admin/catalog/pages/CategoriesPage'));
const AdminBrandsPage = lazy(() => import('../modules/admin/catalog/pages/BrandsPage'));
const AdminManufacturersPage = lazy(() => import('../modules/admin/catalog/pages/ManufacturersPage'));
const AdminOrdersPage = lazy(() => import('../modules/admin/orders/pages/OrdersPage'));
const AdminReturnsPage = lazy(() => import('../modules/admin/orders/pages/ReturnsPage'));
const AdminPrescriptionsPage = lazy(() => import('../modules/admin/customers/pages/PrescriptionsPage'));
const AdminCouponsPage = lazy(() => import('../modules/admin/coupons/pages/CouponsPage'));
const AdminSellersPage = lazy(() => import('../modules/admin/sellers/pages/SellersPage'));
const AdminWarehousesPage = lazy(() => import('../modules/admin/inventory/pages/WarehousesPage'));
const AdminSuppliersPage = lazy(() => import('../modules/admin/inventory/pages/SuppliersPage'));
const AdminBatchesPage = lazy(() => import('../modules/admin/inventory/pages/BatchesPage'));
const AdminAddInventoryPage = lazy(() => import('../modules/admin/inventory/pages/AddInventoryPage'));
const AdminStockTransfersPage = lazy(
  () => import('../modules/admin/inventory/pages/StockTransfersPage'),
);
const AdminDamagedStockPage = lazy(
  () => import('../modules/admin/inventory/pages/DamagedStockPage'),
);
const AdminPurchaseRequestsPage = lazy(
  () => import('../modules/admin/inventory/pages/PurchaseRequestsPage'),
);
const AdminCustomersPage = lazy(() => import('../modules/admin/customers/pages/CustomersPage'));
const AdminDistributorEnquiriesPage = lazy(
  () => import('../modules/admin/distributor-enquiries/pages/DistributorEnquiriesPage'),
);
const AdminPaymentsPage = lazy(() => import('../modules/admin/payments/pages/PaymentsPage'));
const AdminInvoicesPage = lazy(() => import('../modules/admin/invoices/pages/InvoicesPage'));
const AdminDeliveryPartnersPage = lazy(
  () => import('../modules/admin/delivery/pages/DeliveryPartnersPage'),
);
const AdminShippingZonesPage = lazy(
  () => import('../modules/admin/delivery/pages/ShippingZonesPage'),
);
const AdminShippingRulesPage = lazy(
  () => import('../modules/admin/delivery/pages/ShippingRulesPage'),
);
const AdminShipmentsPage = lazy(() => import('../modules/admin/orders/pages/ShipmentsPage'));
const AdminGstSettingsPage = lazy(() => import('../modules/admin/tax/pages/GstSettingsPage'));
const AdminProductTaxMappingsPage = lazy(
  () => import('../modules/admin/tax/pages/ProductTaxMappingsPage'),
);
const AdminBannersPage = lazy(() => import('../modules/admin/cms/pages/BannersPage'));
const AdminHomeSectionsPage = lazy(() => import('../modules/admin/cms/pages/HomeSectionsPage'));
const AdminBlogsPage = lazy(() => import('../modules/admin/cms/pages/BlogsPage'));
const AdminFaqsPage = lazy(() => import('../modules/admin/cms/pages/FaqsPage'));
const AdminPagesPage = lazy(() => import('../modules/admin/cms/pages/PagesPage'));
const AdminNotificationTemplatesPage = lazy(
  () => import('../modules/admin/notifications/pages/NotificationTemplatesPage'),
);
const AdminNotificationHistoryPage = lazy(
  () => import('../modules/admin/notifications/pages/NotificationHistoryPage'),
);
const AdminReportsPage = lazy(() => import('../modules/admin/reports/pages/ReportsPage'));
const AdminAnalyticsPage = lazy(() => import('../modules/admin/reports/pages/AnalyticsPage'));
const AdminSearchAnalyticsPage = lazy(() => import('../modules/admin/reports/pages/SearchAnalyticsPage'));
const AdminProfilePage = lazy(() => import('../modules/admin/profile/pages/AdminProfilePage'));

// Super admin
const RolesPage = lazy(() => import('../modules/superadmin/pages/RolesPage'));
const AdminUsersPage = lazy(() => import('../modules/superadmin/pages/AdminUsersPage'));
const FeatureFlagsPage = lazy(() => import('../modules/superadmin/pages/FeatureFlagsPage'));
const ConfigurationPage = lazy(() => import('../modules/superadmin/pages/ConfigurationPage'));
const DynamicMenuPage = lazy(() => import('../modules/superadmin/pages/DynamicMenuPage'));
const MedicalCompliancePage = lazy(() => import('../modules/superadmin/pages/MedicalCompliancePage'));
const CouponSettingsPage = lazy(() => import('../modules/superadmin/pages/CouponSettingsPage'));
const FulfillmentAutomationPage = lazy(() => import('../modules/superadmin/pages/FulfillmentAutomationPage'));
const NotificationSettingsPage = lazy(() => import('../modules/superadmin/pages/NotificationSettingsPage'));
const AnalyticsSettingsPage = lazy(() => import('../modules/superadmin/pages/AnalyticsSettingsPage'));
const SeoSettingsPage = lazy(() => import('../modules/superadmin/pages/SeoSettingsPage'));
const SecurityCenterPage = lazy(() => import('../modules/superadmin/pages/SecurityCenterPage'));
const AuditCenterPage = lazy(() => import('../modules/superadmin/pages/AuditCenterPage'));
const SiteSettingsPage = lazy(() => import('../modules/admin/cms/pages/SiteSettingsPage'));

// Errors
const NotFoundPage = lazy(() => import('../pages/errors/NotFoundPage'));
const ForbiddenPage = lazy(() => import('../pages/errors/ForbiddenPage'));
const ServerErrorPage = lazy(() => import('../pages/errors/ServerErrorPage'));

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Spinner size="lg" className="text-brand-500" />
    </div>
  );
}

export function AppRouter() {
  const location = useLocation();

  // Prompt 34 Part 15/16 — init once (initAnalytics is itself dedupe-guarded
  // against being called more than once), then track a page_view on every
  // SPA navigation. Deliberately fire-and-forget: analytics must never
  // delay or block rendering (Part 20). initAnalytics resolves only after
  // an async backend config check, so the FIRST page view is tracked here
  // (chained onto init) rather than by the location-effect below, which
  // would otherwise silently miss it — trackPageView() is a safe no-op
  // when called before init finishes, and the dedupe guard means whichever
  // of the two effects successfully sends the initial page view first,
  // it's never sent twice.
  useEffect(() => {
    let cancelled = false;
    void initAnalytics().then(() => {
      if (!cancelled) trackPageView(window.location.pathname + window.location.search);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately runs once on mount only
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public storefront */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/bulk-purchase" element={<BulkPurchasePage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/return-policy" element={<ReturnPolicyPage />} />
            <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
            <Route path="/cancellation-policy" element={<CancellationPolicyPage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />
            <Route path="/blog" element={<BlogListPage />} />
            <Route path="/blog/:slug" element={<BlogDetailPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/brands" element={<PublicBrandsPage />} />
            <Route path="/manufacturers" element={<PublicManufacturersPage />} />
            <Route path="/page/:slug" element={<GenericCmsPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/checkout" element={<CheckoutPage />} />
            </Route>
          </Route>

          {/* Auth */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Route>

          {/* Admin "Continue with Google" lands here straight from the API's
              redirect — not wrapped in AuthLayout/ProtectedRoute since it has
              to work while the session is still bootstrapping. */}
          <Route path="/admin/google-callback" element={<GoogleCallbackPage />} />

          {/* Customer account (authenticated) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<CustomerLayout />}>
              <Route path="/account" element={<CustomerDashboardPage />} />
              <Route path="/account/profile" element={<ProfilePage />} />
              <Route path="/account/addresses" element={<AddressesPage />} />
              <Route path="/account/orders" element={<CustomerOrdersPage />} />
              <Route path="/account/orders/:id" element={<OrderDetailPage />} />
              <Route path="/account/wishlist" element={<WishlistPage />} />
              <Route path="/account/invoices" element={<InvoicesPage />} />
              <Route path="/account/prescriptions" element={<PrescriptionsPage />} />
              <Route path="/account/reviews" element={<MyReviewsPage />} />
              <Route path="/account/coupons" element={<MyCouponsPage />} />
              <Route path="/account/notifications" element={<MyNotificationsPage />} />
            </Route>
          </Route>

          {/* Admin panel */}
          <Route
            element={
              <ProtectedRoute requiredRole={['admin', 'super_admin', 'inventory_manager']} />
            }
          >
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/catalog/products" element={<AdminProductsPage />} />
              <Route path="/admin/catalog/bundles" element={<AdminBundlesPage />} />
              <Route path="/admin/catalog/categories" element={<AdminCategoriesPage />} />
              <Route path="/admin/catalog/brands" element={<AdminBrandsPage />} />
              <Route path="/admin/catalog/manufacturers" element={<AdminManufacturersPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/returns" element={<AdminReturnsPage />} />
              <Route path="/admin/customers/prescriptions" element={<AdminPrescriptionsPage />} />
              <Route path="/admin/coupons" element={<AdminCouponsPage />} />
              <Route path="/admin/sellers" element={<AdminSellersPage />} />
              <Route path="/admin/inventory/warehouses" element={<AdminWarehousesPage />} />
              <Route path="/admin/inventory/suppliers" element={<AdminSuppliersPage />} />
              <Route path="/admin/inventory/batches" element={<AdminBatchesPage />} />
              <Route path="/admin/inventory/add-stock" element={<AdminAddInventoryPage />} />
              <Route path="/admin/inventory/stock-transfers" element={<AdminStockTransfersPage />} />
              <Route path="/admin/inventory/damaged-stock" element={<AdminDamagedStockPage />} />
              <Route
                path="/admin/inventory/purchase-requests"
                element={<AdminPurchaseRequestsPage />}
              />
              <Route path="/admin/customers" element={<AdminCustomersPage />} />
              <Route
                path="/admin/distributor-enquiries"
                element={<AdminDistributorEnquiriesPage />}
              />
              <Route path="/admin/payments" element={<AdminPaymentsPage />} />
              <Route path="/admin/invoices" element={<AdminInvoicesPage />} />
              <Route path="/admin/delivery/partners" element={<AdminDeliveryPartnersPage />} />
              <Route path="/admin/delivery/zones" element={<AdminShippingZonesPage />} />
              <Route path="/admin/delivery/rules" element={<AdminShippingRulesPage />} />
              <Route path="/admin/delivery/shipments" element={<AdminShipmentsPage />} />
              <Route path="/admin/tax/gst-settings" element={<AdminGstSettingsPage />} />
              <Route path="/admin/tax/product-mappings" element={<AdminProductTaxMappingsPage />} />
              <Route path="/admin/cms/banners" element={<AdminBannersPage />} />
              <Route path="/admin/cms/home-sections" element={<AdminHomeSectionsPage />} />
              <Route path="/admin/cms/blogs" element={<AdminBlogsPage />} />
              <Route path="/admin/cms/faqs" element={<AdminFaqsPage />} />
              <Route path="/admin/cms/pages" element={<AdminPagesPage />} />
              <Route path="/admin/cms/site-settings" element={<SiteSettingsPage />} />
              <Route
                path="/admin/notifications/templates"
                element={<AdminNotificationTemplatesPage />}
              />
              <Route
                path="/admin/notifications/history"
                element={<AdminNotificationHistoryPage />}
              />
              <Route path="/admin/reports" element={<AdminReportsPage />} />
              <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="/admin/search-analytics" element={<AdminSearchAnalyticsPage />} />
              <Route path="/admin/profile" element={<AdminProfilePage />} />
            </Route>
          </Route>

          {/* Super admin only */}
          <Route element={<ProtectedRoute requiredRole={['super_admin']} />}>
            <Route element={<SuperAdminLayout />}>
              <Route path="/admin/super" element={<Navigate to="/admin/super/roles" replace />} />
              <Route path="/admin/super/roles" element={<RolesPage />} />
              <Route path="/admin/super/users" element={<AdminUsersPage />} />
              <Route path="/admin/super/feature-flags" element={<FeatureFlagsPage />} />
              <Route path="/admin/super/configuration" element={<ConfigurationPage />} />
              <Route path="/admin/super/dynamic-menu" element={<DynamicMenuPage />} />
              <Route path="/admin/super/medical-compliance" element={<MedicalCompliancePage />} />
              <Route path="/admin/super/coupon-settings" element={<CouponSettingsPage />} />
              <Route path="/admin/super/fulfillment-automation" element={<FulfillmentAutomationPage />} />
              <Route path="/admin/super/notification-settings" element={<NotificationSettingsPage />} />
              <Route path="/admin/super/analytics-settings" element={<AnalyticsSettingsPage />} />
              <Route path="/admin/super/seo-settings" element={<SeoSettingsPage />} />
              <Route path="/admin/super/security" element={<SecurityCenterPage />} />
              <Route path="/admin/super/audit" element={<AuditCenterPage />} />
            </Route>
          </Route>

          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/500" element={<ServerErrorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
