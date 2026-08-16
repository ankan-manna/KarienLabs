import { useQuery } from '@tanstack/react-query';

import { getProduct } from '../../../api/products-public.api';
import { fetchWishlist } from '../../../api/wishlist.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { ProductCard } from '../../storefront/components/ProductCard';

function WishlistProductCard({ productId }: { productId: string }) {
  const { data: product } = useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: () => getProduct(productId),
  });
  if (!product) return null;
  return <ProductCard product={product} />;
}

export default function WishlistPage() {
  const { data: wishlist, isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: fetchWishlist,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Wishlist</h1>

      {isLoading ? (
        <SkeletonRows rows={3} columns={4} />
      ) : !wishlist || wishlist.items.length === 0 ? (
        <EmptyState title="Your wishlist is empty" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {wishlist.items.map((item) => (
            <WishlistProductCard key={item.productId} productId={item.productId} />
          ))}
        </div>
      )}
    </div>
  );
}
