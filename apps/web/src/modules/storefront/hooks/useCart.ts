import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addCartItem,
  applyCartCoupon,
  clearCart,
  fetchCart,
  removeCartCoupon,
  removeCartItem,
  updateCartItem,
} from '../../../api/cart.api';
import { toast } from '../../../utils/toast';

export const CART_KEY = ['cart'];

/**
 * The backend resolves a cart for every visitor now — an authenticated
 * user's own cart, or an anonymous guest's server-issued cart cookie (see
 * `apps/api/src/modules/customers/cart.routes.ts`). So this always runs,
 * regardless of auth state; `withCredentials: true` on the shared axios
 * instance already carries whichever cookie is relevant. `AuthContext`
 * invalidates `CART_KEY` on login/register so the guest-cart cache entry is
 * replaced with the freshly-merged account cart rather than left stale.
 */
export function useCart() {
  return useQuery({ queryKey: CART_KEY, queryFn: fetchCart });
}

export function useCartMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: CART_KEY });

  const add = useMutation({
    mutationFn: ({
      productId,
      quantity,
      variantId,
    }: {
      productId: string;
      quantity: number;
      variantId?: string | null;
    }) => addCartItem(productId, quantity, variantId),
    onSuccess: () => {
      invalidate();
      toast.success('Added to cart');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateQuantity = useMutation({
    mutationFn: ({
      productId,
      quantity,
      variantId,
    }: {
      productId: string;
      quantity: number;
      variantId?: string | null;
    }) => updateCartItem(productId, quantity, variantId),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId?: string | null }) =>
      removeCartItem(productId, variantId),
    onSuccess: invalidate,
  });

  const clear = useMutation({ mutationFn: clearCart, onSuccess: invalidate });

  const applyCoupon = useMutation({
    mutationFn: (code: string) => applyCartCoupon(code),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Coupon applied — you saved ₹${result.discountAmount.toFixed(2)}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeCoupon = useMutation({
    mutationFn: removeCartCoupon,
    onSuccess: () => {
      invalidate();
      toast.success('Coupon removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { add, updateQuantity, remove, clear, applyCoupon, removeCoupon };
}
