import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getAddressVerificationConfig, listAddresses } from '../../../api/addresses.api';
import { createCheckoutIntent, verifyPayment } from '../../../api/orders.api';
import { MobileVerifyPanel } from '../../../components/address/MobileVerifyPanel';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import {
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackBeginCheckout,
  trackPaymentFailed,
  trackPurchase,
  type GaItem,
} from '../../../lib/analytics';
import { formatCurrency } from '../../../utils/format';
import { openRazorpayCheckout, resetCheckoutBodyLock } from '../../../utils/razorpay';
import { toast } from '../../../utils/toast';
import { useCart } from '../hooks/useCart';

/**
 * (prepaid-only redesign) — the outcome of one "pay" attempt.
 * `cancelled` = the customer closed the Razorpay widget without paying.
 * `confirmed` = payment verified AND the order now exists.
 * `processing` = payment WAS captured, but order finalization hasn't
 * resolved yet (Part 24) — never treated as success OR failure.
 */
type PayOutcome =
  | { kind: 'cancelled' }
  | { kind: 'confirmed'; orderId: string; orderNumber: string; value: number; items: GaItem[] }
  | { kind: 'processing' };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cart } = useCart();
  const { data: addresses, isLoading: isLoadingAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: listAddresses,
  });
  // Part 39/40 — each verification requirement is independently
  // super-admin-toggleable server-side (address-verification-config.service.ts);
  // this is fetched so the warning banner below only appears for checks that
  // are ACTUALLY enforced right now, never a hardcoded assumption. The
  // backend's mandatory gate (payment.service.ts::assertAddressReadyForCheckout)
  // remains authoritative regardless — this banner is proactive guidance,
  // not the enforcement itself, so "Pay now" stays clickable either way and
  // a real rejection still surfaces via the existing onError toast below.
  const { data: verificationConfig } = useQuery({
    queryKey: ['address-verification-config'],
    queryFn: getAddressVerificationConfig,
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState(false);

  const subtotal = cart?.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0) ?? 0;

  useEffect(() => {
    if (cart?.items.length) {
      trackBeginCheckout(
        cart.items.map((item) => ({ item_id: item.productId, price: item.priceAtAdd, quantity: item.quantity })),
        subtotal,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per checkout entry, not on every subtotal recompute
  }, [cart?._id]);

  const selectedAddress = addresses?.find((a) => a._id === selectedAddressId) ?? null;
  const addressNeedsMobileVerification = Boolean(
    selectedAddress &&
      verificationConfig?.mobileVerificationEnabled &&
      !selectedAddress.mobileVerified,
  );
  const addressNeedsPincodeVerification = Boolean(
    selectedAddress &&
      verificationConfig?.pincodeValidationEnabled &&
      !selectedAddress.pincodeVerified,
  );

  // Part 4/23 — default-select an address as soon as the list loads, so a
  // customer returning from adding/verifying one doesn't have to re-click
  // the radio button themselves. Prefers the account default; falls back to
  // the first address. Never overrides an address the customer already
  // picked.
  useEffect(() => {
    if (selectedAddressId || !addresses || addresses.length === 0) return;
    const preferred = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(preferred._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the address list itself changes, not on every selection
  }, [addresses]);

  // Part 11/12 — a SINGLE cleanup path, called on every unmount/route-change
  // regardless of how the payment attempt was left (this is a SAFETY NET on
  // top of openRazorpayCheckout's own per-callback cleanup, covering the
  // case where the component unmounts while the widget is still open —
  // neither `onSuccess` nor `onDismiss` fires in that scenario).
  useEffect(() => {
    return () => resetCheckoutBodyLock();
  }, []);

  const payMutation = useMutation({
    mutationFn: async (): Promise<PayOutcome> => {
      // Phase 1 — validate everything and create a Razorpay order for the
      // authoritative, server-computed amount. Creates NO order, touches NO
      // inventory, touches NO cart (see payment.service.ts::createCheckoutIntent).
      const intent = await createCheckoutIntent({
        addressId: selectedAddressId!,
        couponCode: cart?.couponCode ?? undefined,
      });
      if (!intent.keyId) throw new Error('Payments are not configured yet — contact support.');

      const value = intent.razorpayOrder.amount / 100;
      const items: GaItem[] = (cart?.items ?? []).map((item) => ({
        item_id: item.productId,
        price: item.priceAtAdd,
        quantity: item.quantity,
      }));
      // Part 20 — fired right before the Razorpay widget opens, i.e. right
      // as the customer is about to enter payment details. Never treated
      // as a purchase; `purchase` only fires later, after backend
      // confirmation, below.
      trackAddPaymentInfo(value);

      return new Promise<PayOutcome>((resolve, reject) => {
        openRazorpayCheckout({
          keyId: intent.keyId,
          orderId: intent.razorpayOrder.id,
          amount: intent.razorpayOrder.amount,
          currency: intent.razorpayOrder.currency,
          name: 'KarienLabs',
          onSuccess: async (response) => {
            // Backend is authoritative from here — the widget firing
            // `onSuccess` is NEVER itself treated as "order placed" (Part
            // 3/27/29). Only the verified, backend-confirmed result decides
            // what the customer sees next.
            try {
              const result = await verifyPayment(response);
              if (result.status === 'confirmed' && result.orderId && result.orderNumber) {
                resolve({
                  kind: 'confirmed',
                  orderId: result.orderId,
                  orderNumber: result.orderNumber,
                  value,
                  items,
                });
              } else {
                resolve({ kind: 'processing' });
              }
            } catch (err) {
              reject(err);
            }
          },
          onDismiss: () => resolve({ kind: 'cancelled' }),
        }).catch(reject);
      });
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'cancelled') {
        // Part 10/13/28 — cleanup already ran (openRazorpayCheckout's
        // onDismiss handler). Cart is untouched (nothing was ever created
        // server-side for a checkout-intent that never got paid). Customer
        // stays on this exact page and can retry immediately.
        trackPaymentFailed('cancelled');
        toast.info('Payment cancelled — your cart is unchanged, you can try again anytime.');
        return;
      }
      if (outcome.kind === 'processing') {
        // Part 24/29 — payment WAS captured; never show a false failure.
        // Also never navigate to an order-success page for an order that
        // doesn't exist yet — show an explicit "processing" state instead.
        // Deliberately no GA event here either: `purchase` requires a
        // confirmed, finalized order (Part 20), which this isn't yet.
        setProcessingState(true);
        return;
      }
      // Part 13 — the cart was only just cleared server-side, now that an
      // order is confirmed to exist; refetch so the rest of the app (cart
      // badge, etc.) reflects that instead of showing stale items.
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      // Part 20 — fires ONLY here, after the backend has confirmed payment
      // AND finalized the order, using the real order number as the GA
      // transaction_id (never a client-generated value).
      trackPurchase({ transactionId: outcome.orderNumber, value: outcome.value, items: outcome.items });
      toast.success('Payment successful — your order is confirmed.');
      navigate(`/account/orders/${outcome.orderId}`);
    },
    onError: (err: Error) => {
      // Part 10/12 — covers checkout-intent validation failures (stock/
      // combo/coupon/prescription rejected) AND a thrown payment-signature/
      // amount-mismatch error from verify. Cleanup already ran inside
      // openRazorpayCheckout/its callbacks; cart is untouched either way.
      trackPaymentFailed('failed');
      toast.error(err.message || 'Payment could not be completed');
    },
  });

  if (processingState) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <Badge tone="yellow">Processing</Badge>
        <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Payment received — finalizing your order
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Your payment was successful. We&apos;re just finishing setting up your order — this
          usually takes a few seconds. You&apos;ll receive a confirmation email, and the order will
          appear in your order history shortly.
        </p>
        <Button className="mt-4" onClick={() => navigate('/account/orders')}>
          View my orders
        </Button>
      </Card>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add items to your cart before checking out."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-4">
        <h1 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Delivery Address
        </h1>
        {isLoadingAddresses ? (
          <Skeleton className="h-24 w-full" />
        ) : !addresses || addresses.length === 0 ? (
          <EmptyState
            title="No saved addresses"
            description="Add an address to continue checkout."
            action={
              <Button
                size="sm"
                onClick={() => navigate('/account/addresses', { state: { from: '/checkout' } })}
              >
                Add Address
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {addresses.map((address) => (
              <label
                key={address._id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                  selectedAddressId === address._id
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  className="mt-1"
                  checked={selectedAddressId === address._id}
                  onChange={() => {
                    setSelectedAddressId(address._id);
                    trackAddShippingInfo(subtotal);
                  }}
                />
                <span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {address.label}
                  </span>
                  <br />
                  {address.line1}, {address.city}, {address.state} {address.pincode}
                  <br />
                  {address.phone}
                </span>
              </label>
            ))}
          </div>
        )}
        {/* Part 6/7/11/23 — the SAME per-address mobile-OTP flow used on the
            Addresses page, reused here (not reimplemented) so a customer
            never has to guess which "verify phone" screen the checkout gate
            actually reads (payment.service.ts::assertAddressReadyForCheckout
            checks THIS address's `mobileVerified`, not the account-level
            Profile phone verification — reusing this exact component means
            there is no longer a way to complete the wrong flow from here). */}
        {selectedAddress && addressNeedsMobileVerification && (
          <div className="mt-3">
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20">
              This address&apos;s phone number needs to be verified before checkout.
            </p>
            <MobileVerifyPanel
              address={selectedAddress}
              onDone={() => queryClient.invalidateQueries({ queryKey: ['addresses'] })}
            />
          </div>
        )}
        {selectedAddress && !addressNeedsMobileVerification && addressNeedsPincodeVerification && (
          <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20">
            This address&apos;s pincode could not be verified.{' '}
            <Link
              to="/account/addresses"
              state={{ from: '/checkout' }}
              className="font-medium underline"
            >
              Re-check and save it again
            </Link>
            .
          </p>
        )}
      </Card>

      <Card className="flex h-fit flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Order Summary</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          Final total (with GST) is calculated before payment. You will only be charged once, and
          your order is only created after payment succeeds.
        </p>
        <Button
          variant="gradient"
          className="w-full"
          disabled={!selectedAddressId}
          isLoading={payMutation.isPending}
          onClick={() => payMutation.mutate()}
        >
          Pay now
        </Button>
      </Card>
    </div>
  );
}
