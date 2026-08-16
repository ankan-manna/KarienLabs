import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { trackViewCart } from '../../../lib/analytics';
import { formatCurrency } from '../../../utils/format';
import { CartLineItem } from '../components/CartLineItem';
import { useCart, useCartMutations } from '../hooks/useCart';

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const { applyCoupon, removeCoupon } = useCartMutations();
  const [couponCode, setCouponCode] = useState('');
  const navigate = useNavigate();

  const subtotal = cart?.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0) ?? 0;

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
      <EmptyState
        title="Your cart is empty"
        description="Browse our catalog to find what you need."
        action={
          <Link to="/products">
            <Button>Browse products</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-4">
        <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Your Cart</h1>
        {cart.items.map((item) => (
          <CartLineItem key={`${item.productId}-${item.variantId ?? ''}`} item={item} />
        ))}
      </Card>

      <Card className="flex h-fit flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Order Summary</h2>

        {!cart.couponCode && (
          <div className="flex gap-2">
            <Input
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!couponCode}
              isLoading={applyCoupon.isPending}
              onClick={() => applyCoupon.mutate(couponCode)}
            >
              Apply
            </Button>
          </div>
        )}
        {cart.couponCode && (
          <div className="flex items-center justify-between rounded border border-dashed border-green-300 bg-green-50 px-3 py-2 text-xs dark:bg-green-950/20">
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

        <div className="flex justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <p className="text-xs text-gray-400">GST, shipping, and coupon discount are finalized at checkout.</p>

        <Button variant="gradient" className="w-full" onClick={() => navigate('/checkout')}>
          Proceed to checkout
        </Button>
      </Card>
    </div>
  );
}
