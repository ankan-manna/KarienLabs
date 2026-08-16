import { getPublicAnalyticsConfig } from '../api/public-analytics.api';

/**
 * Prompt 34 Part 13-21 — Google Analytics 4 loader + event helpers.
 *
 * Dual-gated (mirrors the existing Google OAuth admin-login precedent):
 * BOTH `VITE_GA_MEASUREMENT_ID` (build-time, public client config — never a
 * secret) AND the backend's `googleAnalyticsEnabled` Configuration flag
 * (checked via the anonymous `/public/analytics-config/config` endpoint)
 * must be satisfied before gtag.js is ever requested. Every exported
 * function is a non-throwing no-op until both gates pass — this module
 * must NEVER block render, checkout, or payment (Part 20).
 *
 * PII rule (Part 18, verbatim in the spec): never send customer name,
 * email, phone, address, GSTIN, OTP, password, tokens, or payment
 * credentials to GA. Every event helper below only accepts
 * product/order-shape identifiers (productId/sku/category/price/qty/
 * currency/orderId/value) — never a free-form object that could carry PII.
 *
 * GA and the app's own MongoDB are deliberately separate data sources
 * (Part 24): this file only ever SENDS data to GA, it never reads
 * anything back for use in the Admin Analytics dashboard — that dashboard
 * is 100% DB-driven (see analytics.service.ts / reports.service.ts).
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type InitState = 'idle' | 'loading' | 'ready' | 'disabled';

let initState: InitState = 'idle';
let measurementId: string | null = null;
let lastTrackedPath: string | null = null;

function pushToDataLayer(...args: unknown[]): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

function loadGtagScript(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-ga-loader="${id}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.dataset.gaLoader = id;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load gtag.js'));
    document.head.appendChild(script);
  });
}

/**
 * Call once, near app startup. Safe to call more than once (dedupe-guarded
 * via `initState`) and safe to call in an environment with no measurement
 * ID configured or GA disabled server-side — both are silent, expected
 * no-ops, not errors.
 */
export async function initAnalytics(): Promise<void> {
  if (initState !== 'idle') return;
  initState = 'loading';
  try {
    const id = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (!id) {
      initState = 'disabled';
      return;
    }
    const { googleAnalyticsEnabled } = await getPublicAnalyticsConfig();
    if (!googleAnalyticsEnabled) {
      initState = 'disabled';
      return;
    }

    await loadGtagScript(id);
    window.gtag = pushToDataLayer;
    window.gtag('js', new Date());
    // send_page_view: false — this app is an SPA; page views are tracked
    // explicitly via trackPageView() on each React Router navigation
    // instead of GA's default (which only fires once, on initial load).
    // anonymize_ip: true — no reason to collect full client IPs for a
    // storefront analytics integration that has no legal/consent UI yet.
    window.gtag('config', id, { send_page_view: false, anonymize_ip: true });
    measurementId = id;
    initState = 'ready';
  } catch (err) {
    // Never let a GA outage/ad-blocker/network failure break the app.
    console.warn('[analytics] Google Analytics did not initialize (non-blocking)', err);
    initState = 'disabled';
  }
}

function isReady(): boolean {
  return initState === 'ready' && typeof window.gtag === 'function';
}

function sendEvent(name: string, params?: Record<string, unknown>): void {
  if (!isReady()) return;
  try {
    window.gtag!('event', name, params);
  } catch (err) {
    console.warn('[analytics] failed to send event (non-blocking)', name, err);
  }
}

/** Hook this to React Router's `useLocation`. Dedupe-guarded against firing twice for the same path (e.g. React 18 StrictMode double-invoke, or an unrelated re-render). */
export function trackPageView(path: string): void {
  if (!isReady() || !measurementId) return;
  if (lastTrackedPath === path) return;
  lastTrackedPath = path;
  sendEvent('page_view', { page_path: path, page_location: window.location.href });
}

/**
 * A single catalog line item, PII-free by construction — never widen this
 * shape to accept arbitrary product fields. `item_name` is optional
 * (matches GA4's own item schema, where `item_id` alone is sufficient):
 * cart/checkout call sites only have productId/price/quantity in scope
 * (see cart.api.ts's `CartItem`), not the product's display name, and
 * deliberately don't re-fetch the full product just to populate this.
 */
export interface GaItem {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price: number;
  quantity?: number;
}

const CURRENCY = 'INR';

export function trackViewItem(item: GaItem): void {
  sendEvent('view_item', { currency: CURRENCY, value: item.price, items: [item] });
}

export function trackViewItemList(items: GaItem[], listName?: string): void {
  if (!items.length) return;
  sendEvent('view_item_list', { item_list_name: listName, items });
}

export function trackAddToCart(item: GaItem): void {
  sendEvent('add_to_cart', {
    currency: CURRENCY,
    value: item.price * (item.quantity ?? 1),
    items: [item],
  });
}

export function trackRemoveFromCart(item: GaItem): void {
  sendEvent('remove_from_cart', {
    currency: CURRENCY,
    value: item.price * (item.quantity ?? 1),
    items: [item],
  });
}

export function trackViewCart(items: GaItem[], value: number): void {
  sendEvent('view_cart', { currency: CURRENCY, value, items });
}

export function trackBeginCheckout(items: GaItem[], value: number): void {
  sendEvent('begin_checkout', { currency: CURRENCY, value, items });
}

export function trackAddShippingInfo(value: number): void {
  sendEvent('add_shipping_info', { currency: CURRENCY, value });
}

export function trackAddPaymentInfo(value: number): void {
  sendEvent('add_payment_info', { currency: CURRENCY, value });
}

/**
 * Part 20 — fire ONLY after the backend has confirmed the payment AND the
 * order was finalized (never on checkout-page-open, never optimistically
 * from the Razorpay widget's own success callback). `transactionId` must be
 * the real order number/ID, not a client-generated value.
 */
export function trackPurchase(order: {
  transactionId: string;
  value: number;
  items: GaItem[];
}): void {
  sendEvent('purchase', {
    transaction_id: order.transactionId,
    currency: CURRENCY,
    value: order.value,
    items: order.items,
  });
}

/** Part 20 — payment cancelled/failed/abandoned; explicitly NEVER reported as a `purchase`. */
export function trackPaymentFailed(reason: 'cancelled' | 'failed'): void {
  sendEvent('payment_failed', { reason });
}

/** Distributor/Bulk Purchase enquiry submission — a lead-gen event, deliberately distinct from `purchase` (an enquiry is not a sale). */
export function trackDistributorEnquirySubmitted(): void {
  sendEvent('generate_lead', { lead_type: 'distributor_enquiry' });
}
