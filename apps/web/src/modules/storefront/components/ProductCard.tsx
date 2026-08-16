import { Link } from 'react-router-dom';

import type { PublicProduct } from '../../../api/products-public.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { RatingStars } from '../../../components/common/RatingStars';
import { trackAddToCart } from '../../../lib/analytics';
import { CLOUDINARY_PRESETS, cloudinaryUrl } from '../../../utils/cloudinary';
import { formatCurrency } from '../../../utils/format';
import { useCartMutations } from '../hooks/useCart';

export function ProductCard({ product }: { product: PublicProduct }) {
  const { add } = useCartMutations();
  // Prompt (Product Image Management) Part 7/8/29 — the card ALWAYS shows
  // the product's configured main image, never a random sub-image, and only
  // ever requests a small transformed thumbnail (never the full-res
  // original) — `mainImage` falls back to the legacy `images[].isPrimary`
  // lookup only for the rare pre-migration response shape (defense in
  // depth; the backend always sends `mainImage` now).
  const mainImageUrl =
    product.mainImage?.url ?? (product.images.find((img) => img.isPrimary) ?? product.images[0])?.url;
  const discountPct =
    product.mrp > product.basePrice ? Math.round((1 - product.basePrice / product.mrp) * 100) : 0;

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Prompt 23 Part 14/21 — links by the SEO-friendly slug (the backend's `findByIdOrSlug` still resolves old bookmarked `/products/:id` links too, so nothing existing breaks). */}
      <Link to={`/products/${product.slug}`} className="block">
        <div className="flex h-40 items-center justify-center bg-gray-50 dark:bg-gray-800">
          {mainImageUrl ? (
            <img
              src={cloudinaryUrl(mainImageUrl, CLOUDINARY_PRESETS.cardThumbnail)}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs text-gray-400">No image</span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap gap-1.5">
          {product.medicine?.prescriptionRequired && <Badge tone="yellow">Rx Required</Badge>}
          {!product.inStock && <Badge tone="red">Out of Stock</Badge>}
        </div>
        <Link
          to={`/products/${product.slug}`}
          className="line-clamp-2 text-sm font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100"
        >
          {product.name}
        </Link>
        {!!product.ratingCount && (
          <RatingStars value={product.ratingAvg ?? 0} count={product.ratingCount} size="sm" />
        )}
        <div className="mt-auto flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(product.basePrice)}
          </span>
          {discountPct > 0 && (
            <>
              <span className="text-xs text-gray-400 line-through">
                {formatCurrency(product.mrp)}
              </span>
              <span className="text-xs font-medium text-green-600">{discountPct}% off</span>
            </>
          )}
        </div>
        <Button
          size="sm"
          disabled={!product.inStock}
          onClick={() => {
            add.mutate({ productId: product._id, quantity: 1 });
            trackAddToCart({
              item_id: product._id,
              item_name: product.name,
              item_category: product.categoryId,
              price: product.basePrice,
              quantity: 1,
            });
          }}
          isLoading={add.isPending}
        >
          {product.inStock ? 'Add to cart' : 'Out of stock'}
        </Button>
      </div>
    </Card>
  );
}
