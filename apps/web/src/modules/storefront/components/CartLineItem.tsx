import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

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

  if (!product) return <Skeleton className="h-24 w-full" />;

  const image = product.mainImage ?? (product.images.find((img) => img.isPrimary) ?? product.images[0]);

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-pale-sage py-4 last:border-0 dark:border-night-border sm:flex-nowrap">
      <Link
        to={`/products/${product.slug}`}
        className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-50 dark:bg-night-elevated"
      >
        {image && <img src={image.url} alt={product.name} className="h-full w-full object-cover" />}
      </Link>
      <div className="min-w-[140px] flex-1">
        <Link
          to={`/products/${product.slug}`}
          className="line-clamp-2 text-sm font-medium text-ink hover:text-accent dark:text-night-text"
        >
          {product.name}
        </Link>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-night-muted">
          {formatCurrency(item.priceAtAdd)} each
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
          className="mt-1 text-xs font-medium text-red-500 hover:underline sm:hidden"
        >
          Remove
        </button>
      </div>
      <div className="flex items-center rounded-full border border-pale-sage dark:border-night-border">
        <button
          type="button"
          aria-label="Decrease quantity"
          className="px-3 py-1.5 text-gray-500 hover:text-ink dark:text-night-muted dark:hover:text-night-text"
          onClick={() =>
            updateQuantity.mutate({ productId: item.productId, quantity: item.quantity - 1 })
          }
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-medium text-ink dark:text-night-text">{item.quantity}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          className="px-3 py-1.5 text-gray-500 hover:text-ink dark:text-night-muted dark:hover:text-night-text"
          onClick={() =>
            updateQuantity.mutate({ productId: item.productId, quantity: item.quantity + 1 })
          }
        >
          +
        </button>
      </div>
      <p className="w-20 flex-shrink-0 text-right text-sm font-semibold text-ink dark:text-night-text">
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
        className="hidden flex-shrink-0 text-xs font-medium text-red-500 hover:underline sm:block"
      >
        Remove
      </button>
    </div>
  );
}
