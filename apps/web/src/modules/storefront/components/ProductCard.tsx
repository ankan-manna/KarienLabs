import { motion, useReducedMotion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  // (Product Image Management) Part 7/8/29 — the card ALWAYS shows
  // the product's configured main image, never a random sub-image, and only
  // ever requests a small transformed thumbnail (never the full-res
  // original) — `mainImage` falls back to the legacy `images[].isPrimary`
  // lookup only for the rare pre-migration response shape (defense in
  // depth; the backend always sends `mainImage` now).
  const mainImageUrl =
    product.mainImage?.url ??
    (product.images.find((img) => img.isPrimary) ?? product.images[0])?.url;
  const discountPct =
    product.mrp > product.basePrice ? Math.round((1 - product.basePrice / product.mrp) * 100) : 0;

  const addItem = (onAdded?: () => void) => {
    add.mutate({ productId: product._id, quantity: 1 }, { onSuccess: onAdded });
    trackAddToCart({
      item_id: product._id,
      item_name: product.name,
      item_category: product.categoryId,
      price: product.basePrice,
      quantity: 1,
    });
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35, ease: 'easeOut' as const }}
      whileHover={prefersReducedMotion ? undefined : { y: -6 }}
    >
      <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
        <Link to={`/products/${product.slug}`} className="relative block">
          <div className="flex aspect-square items-center justify-center bg-gray-50 dark:bg-night-elevated">
            {mainImageUrl ? (
              <img
                src={cloudinaryUrl(mainImageUrl, CLOUDINARY_PRESETS.cardThumbnail)}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="text-xs text-gray-400">No image</span>
            )}
          </div>
          {discountPct > 0 && (
            <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
              {discountPct}% OFF
            </span>
          )}
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            {product.medicine?.prescriptionRequired && <Badge tone="yellow">Rx</Badge>}
            {!product.inStock && <Badge tone="red">Out of Stock</Badge>}
          </div>
        </Link>
        <div className="flex flex-1 flex-col gap-1 p-3">
          {product.brandName && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {product.brandName}
            </span>
          )}
          <Link
            to={`/products/${product.slug}`}
            className="line-clamp-2 text-sm font-medium text-ink hover:text-accent dark:text-night-text"
          >
            {product.name}
          </Link>
          {!!product.ratingCount && (
            <RatingStars value={product.ratingAvg ?? 0} count={product.ratingCount} size="sm" />
          )}
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-semibold text-ink dark:text-night-text">
              {formatCurrency(product.basePrice)}
            </span>
            {discountPct > 0 && (
              <span className="text-xs text-gray-500 line-through">
                {formatCurrency(product.mrp)}
              </span>
            )}
          </div>
          <div className="mt-auto flex gap-2 pt-2">
            <Button
              size="sm"
              variant="coral"
              className="flex-1"
              disabled={!product.inStock}
              onClick={() => addItem()}
              isLoading={add.isPending}
            >
              {product.inStock ? 'Add to cart' : 'Out of stock'}
            </Button>
            {product.inStock && (
              <Button
                size="sm"
                variant="teal"
                className="flex-1"
                onClick={() => addItem(() => navigate('/checkout'))}
              >
                Buy now
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
