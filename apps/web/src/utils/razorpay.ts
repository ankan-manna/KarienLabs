declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Part 11 — the Razorpay Checkout widget manipulates `<body>` styles
 * (scroll locking) itself while its modal/iframe is open, and is SUPPOSED to
 * undo that on close — but that cleanup is third-party code we don't
 * control, and it doesn't reliably run on every exit path (a thrown error
 * mid-open, an unusual network hiccup while the iframe is transitioning,
 * the host page navigating away while the widget is still mid-animation).
 * Rather than patching one callback, this is the SINGLE place that resets
 * whatever scroll-blocking state may have been left behind — called
 * defensively before opening (in case a PREVIOUS attempt left something
 * stuck) and unconditionally after every possible exit (success, dismiss,
 * thrown error), via `openRazorpayCheckout`'s try/finally-style wrapping
 * below. `CheckoutPage.tsx` also calls this on unmount as a second,
 * independent safety net (covers route-change/back-navigation abandonment,
 * where neither `onSuccess` nor `onDismiss` ever fires because the
 * component itself was torn down while the widget was still open).
 */
export function resetCheckoutBodyLock(): void {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.documentElement.style.overflow = '';
}

interface OpenRazorpayCheckoutInput {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  onSuccess: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  /** Called when the customer closes the widget without completing payment (cancel). */
  onDismiss?: () => void;
}

/**
 * Part 11/12 — every exit path (success, dismiss/cancel, script
 * load failure, `Razorpay.open()` throwing synchronously) funnels through
 * ONE cleanup call, so the caller (`CheckoutPage.tsx`) never has to
 * remember to reset scroll/loading state in more than one place, and a
 * bug in one callback can't leave the page permanently locked.
 */
export async function openRazorpayCheckout(input: OpenRazorpayCheckoutInput): Promise<void> {
  resetCheckoutBodyLock();

  let loaded: boolean;
  try {
    loaded = await loadRazorpayScript();
  } catch {
    resetCheckoutBodyLock();
    throw new Error('Failed to load payment gateway');
  }
  if (!loaded || !window.Razorpay) {
    resetCheckoutBodyLock();
    throw new Error('Failed to load payment gateway');
  }

  try {
    const razorpay = new window.Razorpay({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      name: input.name,
      handler: (response: Parameters<OpenRazorpayCheckoutInput['onSuccess']>[0]) => {
        resetCheckoutBodyLock();
        input.onSuccess(response);
      },
      modal: {
        ondismiss: () => {
          resetCheckoutBodyLock();
          input.onDismiss?.();
        },
      },
    });
    razorpay.open();
  } catch (err) {
    // `Razorpay.open()` (or the constructor) throwing synchronously — the
    // widget never actually opened, so there's nothing visually stuck, but
    // reset defensively anyway in case it got partway through mutating body
    // styles before throwing.
    resetCheckoutBodyLock();
    throw err instanceof Error ? err : new Error('Failed to open payment gateway');
  }
}
