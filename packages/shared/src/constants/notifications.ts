export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  // Added for Prompt 10's OTP delivery-channel requirement — otherwise a
  // provider-abstracted OtpService with an `otpChannel: 'whatsapp'` option
  // would have nowhere real to dispatch to. See
  // apps/api/src/integrations/notifications/whatsapp-transport.ts.
  WHATSAPP: 'whatsapp',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export const NOTIFICATION_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
  // Prompt 20 — a notification that was NEVER enqueued to the dispatch
  // queue because Configuration (channel or category toggle) disabled it at
  // enqueue time. Written directly to history so the skip is observable
  // (Part 27), never silently dropped.
  CANCELLED: 'cancelled',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

export const CONFIGURATION_NAMESPACES = {
  GLOBAL: 'global',
  BUSINESS: 'business',
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  SHIPPING: 'shipping',
  EMAIL: 'email',
  SMS: 'sms',
  RAZORPAY: 'razorpay',
  CLOUDINARY: 'cloudinary',
  GST: 'gst',
  CMS: 'cms',
  // Prompt 15 — AWS S3 / MinIO credentials + retention-days knobs (Part 28).
  // Pre-existing gap found and fixed in Prompt 27: `s3.client.ts` has always
  // read/written this namespace via `getConfiguration`/`setConfiguration`
  // (which don't run Mongoose validators, so the omission was silently
  // harmless there) but it was never actually listed here, which broke the
  // ONE thing that DOES validate against this enum — a direct
  // `ConfigurationModel.create()`/`.save()` call.
  S3: 's3',
  // Prompt 10 — OTP + admin Google-login knobs, admin-editable via the
  // existing Configuration Engine (superadmin ConfigurationPage) rather than
  // a parallel settings surface. See apps/api/src/modules/auth/auth-config.service.ts.
  AUTHENTICATION: 'authentication',
  // Prompt 17 — prescription/medical-compliance feature toggles (Part 38).
  // See modules/customers/prescription-config.service.ts.
  PRESCRIPTION: 'prescription',
  // Prompt 19 — coupon/promotion management feature toggles (Part 8/52).
  // See modules/coupons/coupon-config.service.ts.
  COUPON: 'coupon',
  // Prompt 20 — notification channel/category enable-disable toggles
  // (Part 14/15/47). See modules/notifications/notification-config.service.ts.
  NOTIFICATION: 'notification',
  // Prompt 22 — per-domain admin analytics/BI enable-disable toggles
  // (Part 2/3/38/46). See modules/admin/analytics-config.service.ts.
  ANALYTICS: 'analytics',
  // Prompt 23 — Search/SEO/AEO/GEO feature toggles (Part 16/17/49).
  // See modules/search/seo-config.service.ts.
  SEO: 'seo',
  // Prompt 27 — automated post-payment fulfillment (6-hour sweep) toggles
  // and cadence (Part 30). See modules/orders/fulfillment-config.service.ts.
  FULFILLMENT: 'fulfillment',
  // Prompt 31 — customer address pincode-validation / mobile-OTP /
  // pre-payment Shiprocket serviceability gate toggles (Part 44/45). See
  // modules/customers/address-verification-config.service.ts.
  ADDRESS_VERIFICATION: 'address_verification',
  // Prompt 32 — Distributor/Bulk Purchase enquiry enable/disable + OTP +
  // email-notification toggles (Part 36). See
  // modules/distributor-enquiries/distributor-enquiry-config.service.ts.
  DISTRIBUTOR_ENQUIRY: 'distributor_enquiry',
  // Super-Admin-configurable rate-limit policies (window minutes + request
  // count per policy — Login/OTP/Password Reset/Search/Export-Import/Admin
  // API/Public API). See middlewares/rate-limit-config.util.ts.
  RATE_LIMITING: 'rateLimiting',
  // Product Image Management — Super-Admin-configurable max sub/additional
  // images per product (Part 4). See modules/catalog/catalog-config.service.ts.
  CATALOG: 'catalog',
} as const;

export type ConfigurationNamespace =
  (typeof CONFIGURATION_NAMESPACES)[keyof typeof CONFIGURATION_NAMESPACES];
