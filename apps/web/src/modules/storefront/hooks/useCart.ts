import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addCartItem,
  applyCartCoupon,
  clearCart,
  fetchCart,
  removeCartCoupon,
  removeCartItem,
  updateCartItem,
} from '../../../api/cart.api';
import { useAuth } from '../../../context/AuthContext';
import { toast } from '../../../utils/toast';

const CART_KEY = ['cart'];

export function useCart() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: CART_KEY, queryFn: fetchCart, enabled: isAuthenticated });
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
