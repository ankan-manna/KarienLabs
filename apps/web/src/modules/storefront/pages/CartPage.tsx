import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackViewCart } from '../../../lib/analytics';
import { formatCurrency } from '../../../utils/format';
import { CartLineItem } from '../components/CartLineItem';
import { useCart, useCartMutations } from '../hooks/useCart';

function EmptyCartIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16 text-primary" aria-hidden="true">
      <path
        d="M10 20h44l-4 28a4 4 0 0 1-4 3.5H18a4 4 0 0 1-4-3.5L10 20Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 20v-4a10 10 0 0 1 20 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { applyCoupon, removeCoupon } = useCartMutations();
  const [couponCode, setCouponCode] = useState('');
  const navigate = useNavigate();

  useDocumentMeta({ title: 'Your Cart', description: 'Review the items in your cart before checkout.' });

  const subtotal = cart?.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0) ?? 0;
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  useEffect(() => {
    if (cart?.items.length) {
      trackViewCart(
        cart.items.map((item) => ({
          item_id: item.productId,
          price: item.priceAtAdd,
          quantity: item.quantity,
        })),
        subtotal,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when the cart's item set itself changes
  }, [cart?._id, cart?.items.length]);

  if (isLoading) return null;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-deep-teal dark:bg-night-elevated">
          <EmptyCartIcon />
        </span>
        <div>
          <h1 className="font-brentis-display text-xl font-semibold text-ink dark:text-night-text">
            Your cart is empty
          </h1>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-night-muted">
            Browse our catalog to find genuine medicines and wellness essentials.
          </p>
        </div>
        <Link to="/products">
          <Button variant="coral">Browse products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: 'Cart' }]} />
      <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text">
        Your Cart <span className="text-base font-normal text-gray-500 dark:text-night-muted">({itemCount} item{itemCount === 1 ? '' : 's'})</span>
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-4 sm:p-6">
          {cart.items.map((item) => (
            <CartLineItem key={`${item.productId}-${item.variantId ?? ''}`} item={item} />
          ))}
          <Link to="/products" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            ← Continue shopping
          </Link>
        </Card>

        <Card className="flex h-fit flex-col gap-4 p-4 sm:p-6">
          <h2 className="font-brentis-display text-base font-semibold text-ink dark:text-night-text">
            Order Summary
          </h2>

          {!cart.couponCode && (
            <div className="flex gap-2">
              <Input
                placeholder="Coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />
              <Button
                variant="teal"
                disabled={!couponCode}
                isLoading={applyCoupon.isPending}
                onClick={() => applyCoupon.mutate(couponCode)}
              >
                Apply
              </Button>
            </div>
          )}
          {cart.couponCode && (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-green-300 bg-green-50 px-3 py-2 text-xs dark:bg-green-950/20">
              <span className="text-green-700 dark:text-green-400">
                Coupon &quot;{cart.couponCode}&quot; applied
                {applyCoupon.data && ` — you saved ${formatCurrency(applyCoupon.data.discountAmount)}`}
              </span>
              <button
                type="button"
                className="font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                disabled={removeCoupon.isPending}
                onClick={() => removeCoupon.mutate()}
              >
                Remove
              </button>
            </div>
          )}

          <div className="flex justify-between border-t border-pale-sage pt-3 text-sm dark:border-night-border">
            <span className="text-gray-500 dark:text-night-muted">
              Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
            </span>
            <span className="font-medium text-ink dark:text-night-text">{formatCurrency(subtotal)}</span>
          </div>
          <p className="-mt-2 text-xs text-gray-400 dark:text-night-muted">
            GST, shipping, and coupon discount are calculated at checkout based on your delivery address.
          </p>

          <Button variant="coral" className="w-full" onClick={() => navigate('/checkout')}>
            Proceed to checkout
          </Button>
        </Card>
      </div>
    </div>
  );
}
