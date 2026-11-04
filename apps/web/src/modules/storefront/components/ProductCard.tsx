import { motion, useReducedMotion } from 'framer-motion';
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

interface ProductCardProps {
  product: PublicProduct;
  /**
   * 'cover' (default) fills the image box edge-to-edge.
   * 'contain' pads the image on a neutral light background.
   */
  imageFit?: 'cover' | 'contain';
  /** When true, renders an orange "Best Seller" badge below the image area. */
  bestSellerBadge?: boolean;
}

export function ProductCard({ product, imageFit = 'cover', bestSellerBadge = false }: ProductCardProps) {
  const { add } = useCartMutations();
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

  const addItem = () => {
    add.mutate({ productId: product._id, quantity: 1 });
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
          <div
            className={`flex aspect-square items-center justify-center bg-gray-50 dark:bg-night-elevated ${
              imageFit === 'contain' ? 'p-6' : ''
            }`}
          >
            {mainImageUrl ? (
              <img
                src={cloudinaryUrl(mainImageUrl, CLOUDINARY_PRESETS.cardThumbnail)}
                alt={product.name}
                loading="lazy"
                className={`h-full w-full transition-transform duration-200 group-hover:scale-[1.03] ${
                  imageFit === 'contain' ? 'object-contain' : 'object-cover'
                }`}
              />
            ) : (
              <span className="text-xs text-gray-400">No image</span>
            )}
          </div>
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {discountPct > 0 && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                {discountPct}% OFF
              </span>
            )}
            {/* Real-rating badge, overlaid on the image corner — matches the
                reference's own product-card rating badge treatment. Only
                ever rendered from real `ratingCount`/`ratingAvg` data, never
                a fabricated default. */}
            {!!product.ratingCount && (
              <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm dark:bg-night-surface dark:text-night-text">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-primary" aria-hidden="true">
                  <path d="M10 1.5l2.39 4.84 5.34.78-3.87 3.77.91 5.32L10 13.77l-4.77 2.44.91-5.32-3.87-3.77 5.34-.78L10 1.5Z" />
                </svg>
                {(product.ratingAvg ?? 0).toFixed(1)}
              </span>
            )}
          </div>
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            {product.medicine?.prescriptionRequired && <Badge tone="yellow">Rx</Badge>}
            {!product.inStock && <Badge tone="red">Out of Stock</Badge>}
          </div>
        </Link>
        {bestSellerBadge && (
          <span className="mx-3 mt-2 inline-block rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
            Best Seller
          </span>
        )}
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
          {/* Prompt-2 refinement: a single, full-width primary CTA — the
              measured reference card uses exactly one 44px button ("View
              Options"), and the prior two-button row (Add to cart + Buy now,
              each ~50% width) was the actual measured cause of this card
              reading busier than the reference at a comparable footprint
              (see docs/BRENTIS_VISUAL_AUDIT.md §G). "Buy now" is not
              removed from the app — it remains on the PDP's own purchase
              actions — only the card-level duplicate affordance is gone. */}
          <div className="mt-auto pt-2">
            <Button
              size="sm"
              variant="coral"
              className="w-full"
              disabled={!product.inStock}
              onClick={() => addItem()}
              isLoading={add.isPending}
            >
              {product.inStock ? 'Add to cart' : 'Out of stock'}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
