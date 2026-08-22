import { useQuery } from '@tanstack/react-query';

import type { CartItem } from '../../../api/cart.api';
import { getProduct } from '../../../api/products-public.api';
import { Skeleton } from '../../../components/common/Skeleton';
import { trackRemoveFromCart } from '../../../lib/analytics';
import { formatCurrency } from '../../../utils/format';
import { useCartMutations } from '../hooks/useCart';

export function CartLineItem({ item }: { item: CartItem }) {
  const { data: product } = useQuery({
    queryKey: ['products', 'detail', item.productId],
    queryFn: () => getProduct(item.productId),
  });
  const { updateQuantity, remove } = useCartMutations();

  if (!product) return <Skeleton className="h-20 w-full" />;

  const image = product.images.find((img) => img.isPrimary) ?? product.images[0];

  return (
    <div className="flex items-center gap-4 border-b border-gray-100 py-4 last:border-0 dark:border-night-border">
      <div className="h-16 w-16 flex-shrink-0 rounded-md bg-gray-50 dark:bg-night-elevated">
        {image && (
          <img
            src={image.url}
            alt={product.name}
            className="h-full w-full rounded-md object-cover"
          />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-night-text">{product.name}</p>
        <p className="text-sm text-gray-500">{formatCurrency(item.priceAtAdd)} each</p>
      </div>
      <div className="flex items-center rounded-md border border-gray-300 dark:border-night-border">
        <button
          className="px-2.5 py-1 text-gray-500"
          onClick={() =>
            updateQuantity.mutate({ productId: item.productId, quantity: item.quantity - 1 })
          }
        >
          −
        </button>
        <span className="w-8 text-center text-sm">{item.quantity}</span>
        <button
          className="px-2.5 py-1 text-gray-500"
          onClick={() =>
            updateQuantity.mutate({ productId: item.productId, quantity: item.quantity + 1 })
          }
        >
          +
        </button>
      </div>
      <p className="w-20 text-right text-sm font-medium text-gray-900 dark:text-night-text">
        {formatCurrency(item.priceAtAdd * item.quantity)}
      </p>
      <button
        onClick={() => {
          remove.mutate({ productId: item.productId });
          trackRemoveFromCart({
            item_id: item.productId,
            item_name: product.name,
            item_category: product.categoryId,
            price: item.priceAtAdd,
            quantity: item.quantity,
          });
        }}
        className="text-xs text-red-500 hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
