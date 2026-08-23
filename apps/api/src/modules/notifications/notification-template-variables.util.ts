/**
 * Part 18/19 — safe placeholder validation for admin-authored
 * Handlebars notification templates. Two layers:
 *
 * 1. A GLOBAL blocklist — these variable names are never allowed in ANY
 *    template, full stop (Part 19's explicit list: password/otp/jwt/
 *    paymentSecret and their common spelling variants).
 * 2. A PER-TEMPLATE-KEY whitelist for the templates this system already
 *    knows about — e.g. `order_status_changed` may reference
 *    `{{orderNumber}}` but not `{{refundAmount}}` (that belongs to
 *    `refund_success`). The one deliberate, documented exception: `code` is
 *    globally blocked EXCEPT for the two OTP templates
 *    (`login_otp`/`password_reset_otp`), which legitimately need to render
 *    the delivered code — those are the ONLY templates where `code` isn't
 *    treated as a forbidden secret-shaped name.
 *
 * An UNKNOWN templateKey (an admin creating a genuinely new, ad-hoc
 * template) is only checked against the global blocklist — this system
 * can't whitelist variables for a template key it doesn't know about, so it
 * falls back to "at minimum, never a secret-shaped name."
 */

const GLOBALLY_FORBIDDEN_VARIABLES = new Set([
  'password',
  'passwordhash',
  'otp',
  // The actual variable name the OTP delivery path uses (see
  // otp.service.ts's deliverOtp: `data: { code, ... }`) — forbidden
  // everywhere EXCEPT the two OTP template keys (the isOtpTemplate check
  // below).
  'code',
  'jwt',
  'token',
  'accesstoken',
  'refreshtoken',
  'paymentsecret',
  'apikey',
  'secret',
  'awssecretaccesskey',
  'razorpaysecret',
  'webhooksecret',
  'cardnumber',
  'cvv',
  'prescriptioncontent',
  'documentcontent',
]);

/** Templates where `code` legitimately means "the OTP code being delivered," not a forbidden secret placeholder. */
const OTP_TEMPLATE_KEYS = new Set([
  'login_otp',
  'password_reset_otp',
  'phone_verification_otp',
  // registration-gate OTP; address-mobile verification
  // deliberately reuses `phone_verification_otp` above rather than adding a
  // second template key (see otp.service.ts's templateKeyFor).
  'registration_otp',
   // guest distributor contact-verification OTP (Part 10/11).
  'distributor_enquiry_verification',
]);

/**
 * Field names below are verified against the ACTUAL `data` object each
 * call site passes (not guessed) — customer-facing templates driven by
 * `notifyOrderStatusChange`/`notifyReturnEvent`/similar shared helpers pass
 * the customer's name as `name`, NOT `customerName`; only the NEW
 * -20-authored helpers (prescription/payment/admin-* notifications)
 * use `customerName`. A few additional, safe, currently-unused-but-
 * documented field names from Part 7/9/18's example lists are also allowed
 * per key (e.g. `orderDate`, `trackingNumber`) — an admin referencing one
 * that the current call site doesn't yet populate just renders blank,
 * which is safe, not a security concern, and keeps room for a future call
 * site to start passing it without also needing a whitelist change.
 */
const TEMPLATE_VARIABLE_WHITELIST: Record<string, string[]> = {
  order_status_changed: ['name', 'orderNumber', 'status', 'orderDate', 'orderTotal', 'deliveryAddress'],
  shipment_status_changed: ['name', 'orderNumber', 'status', 'trackingNumber', 'courierName', 'estimatedDelivery'],
  return_requested: ['name', 'returnNumber', 'orderNumber'],
  return_approved: ['name', 'returnNumber'],
  return_rejected: ['name', 'reason'],
  return_picked_up: ['name', 'returnNumber', 'pickupDate'],
  return_received: ['name', 'returnNumber'],
  refund_success: ['name', 'amount'],
  refund_failed: ['name', 'reason'],
  refund_processed: ['name', 'orderNumber', 'amount'],
  replacement_approved: ['name', 'orderNumber'],
  return_requested_admin: ['returnNumber', 'orderNumber', 'customerName'],
  refund_failed_admin: ['returnNumber', 'reason'],
  payment_success: ['customerName', 'orderNumber', 'amount'],
  payment_failed_admin: ['orderNumber', 'customerName', 'reason'],
  // (prepaid-only redesign) — a failed/cancelled payment no longer
  // has an order to reference (the whole point of the redesign: no Order
  // exists until payment is captured), so this is deliberately narrower
  // than payment_failed_admin (no orderNumber).
  payment_failed_customer: ['customerName', 'reason'],
  // Part 24 — "payment captured but order finalization failed" admin alert;
  // never sent to the customer (they only ever see a safe "processing"
  // state, never this internal reconciliation detail).
  payment_reconciliation_admin: ['paymentId', 'razorpayOrderId', 'amount', 'reason', 'userId'],
  prescription_uploaded: ['customerName', 'orderNumber'],
  prescription_pending_review_admin: ['customerName', 'orderNumber', 'prescriptionId'],
  prescription_approved: ['customerName', 'orderNumber', 'expiryDate'],
  prescription_rejected: ['customerName', 'orderNumber', 'reason'],
  login_otp: ['code', 'expiryMinutes'],
  password_reset_otp: ['code', 'expiryMinutes'],
  phone_verification_otp: ['code', 'expiryMinutes'],
  registration_otp: ['code', 'expiryMinutes'],
  distributor_enquiry_verification: ['code', 'expiryMinutes'],
   // new business-enquiry notification pair (Part 27/28).
  distributor_enquiry_new: [
    'enquiryNumber',
    'companyName',
    'contactPerson',
    'contactEmail',
    'contactMobile',
    'productSummary',
  ],
  distributor_enquiry_confirmation: ['companyName', 'enquiryNumber'],
  password_reset: ['name'],
  password_reset_confirmation: ['name'],
  email_verification: ['name'],
  invoice_email: ['invoiceNumber', 'orderNumber', 'pdfUrl'],
  weekly_sales_report: ['name', 'totalOrders', 'totalRevenue', 'totalGst', 'daysCovered'],
  low_stock_alert: ['productName', 'sku', 'totalAvailable', 'reorderLevel'],
  batch_near_expiry: ['batchNumber', 'expiryDate', 'quantityAvailable'],
  admin_new_order: ['orderNumber', 'customerName', 'orderTotal'],
};

const BLOCK_HELPER_KEYWORDS = new Set(['if', 'unless', 'each', 'with', 'else']);

/**
 * `{{customerName}}`, `{{ orderNumber }}`, `{{#if status}}`,
 * `{{#each items}}`, etc. — extracts every variable/helper-parameter name
 * referenced in a Handlebars source string. Each `{{...}}` occurrence can
 * carry MULTIPLE tokens (a block helper's keyword AND its parameter, e.g.
 * `#if status` is two tokens) — every non-keyword token is a real variable
 * reference the caller's `data` object needs to satisfy, not just the
 * first word after `{{`.
 */
export function extractTemplateVariables(source: string): string[] {
  const blocks = source.matchAll(/\{\{\{?\s*([^}]+?)\s*\}\}\}?/g);
  const names = new Set<string>();
  for (const match of blocks) {
    const tokens = match[1].split(/\s+/).map((t) => t.replace(/^[#/]/, ''));
    for (const raw of tokens) {
      if (!raw || BLOCK_HELPER_KEYWORDS.has(raw)) continue;
      // Take only the ROOT segment of a dotted path (e.g. `order.number` ->
      // `order`) — that's what the caller's `data` object is keyed by.
      const root = raw.split('.')[0];
      if (root && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(root)) names.add(root);
    }
  }
  return [...names];
}

/**
 * Throws a descriptive error listing every disallowed variable found,
 * rather than failing on just the first one — an admin fixing a template
 * wants the full list in one pass.
 */
export function validateTemplateVariables(templateKey: string, source: string): void {
  const variables = extractTemplateVariables(source);
  const isOtpTemplate = OTP_TEMPLATE_KEYS.has(templateKey);
  const whitelist = TEMPLATE_VARIABLE_WHITELIST[templateKey];

  const disallowed: string[] = [];
  for (const name of variables) {
    const normalized = name.toLowerCase();
    if (GLOBALLY_FORBIDDEN_VARIABLES.has(normalized) && !(isOtpTemplate && normalized === 'code')) {
      disallowed.push(name);
      continue;
    }
    if (whitelist && !whitelist.includes(name)) {
      disallowed.push(name);
    }
  }

  if (disallowed.length > 0) {
    throw new Error(
      `Template contains disallowed variable(s): ${[...new Set(disallowed)].join(', ')}`,
    );
  }
}

export { GLOBALLY_FORBIDDEN_VARIABLES, TEMPLATE_VARIABLE_WHITELIST, OTP_TEMPLATE_KEYS };
