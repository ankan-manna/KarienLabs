import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getProduct, listCategoryTree, listProducts } from '../../../api/products-public.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { RatingStars } from '../../../components/common/RatingStars';
import { Skeleton } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta, useStructuredData } from '../../../hooks/useDocumentMeta';
import { useRecentlyViewed } from '../../../hooks/useRecentlyViewed';
import { trackAddToCart, trackViewItem } from '../../../lib/analytics';
import { CLOUDINARY_PRESETS, cloudinaryUrl } from '../../../utils/cloudinary';
import { formatCurrency } from '../../../utils/format';
import { ProductCard } from '../components/ProductCard';
import { ProductReviews } from '../components/ProductReviews';
import { RecentlyViewedProducts } from '../components/RecentlyViewedProducts';
import { useCartMutations } from '../hooks/useCart';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const { add } = useCartMutations();
  const { recordView } = useRecentlyViewed();

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => getProduct(id as string),
    enabled: !!id,
  });

  const { data: related } = useQuery({
    queryKey: ['products', 'related', product?.categoryId],
    queryFn: () => listProducts({ limit: 4, filter: { categoryId: product!.categoryId } }),
    enabled: !!product?.categoryId,
  });

  // Just for the breadcrumb's category label — the product-detail response
  // only carries `categoryId`, not the category's name (confirmed in
  // products-public.api.ts), so this resolves it against the same public
  // category tree the PLP already fetches/caches.
  const { data: categoryTree } = useQuery({ queryKey: ['categories', 'tree'], queryFn: listCategoryTree });
  const categoryName = (() => {
    if (!product?.categoryId || !categoryTree) return undefined;
    const find = (nodes: typeof categoryTree): string | undefined => {
      for (const n of nodes) {
        if (n._id === product.categoryId) return n.name;
        const found = find((n.children as typeof categoryTree) ?? []);
        if (found) return found;
      }
      return undefined;
    };
    return find(categoryTree);
  })();

  useEffect(() => {
    if (product) recordView(product._id);
  }, [product, recordView]);

  useEffect(() => {
    if (product) {
      trackViewItem({
        item_id: product._id,
        item_name: product.name,
        item_category: product.categoryId,
        price: product.basePrice,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when the product identity itself changes
  }, [product?._id]);

  useDocumentMeta({
    title: product?.seo?.metaTitle || product?.name || 'Product',
    description: product?.seo?.metaDescription || product?.shortDescription,
    canonical: product?.seo?.canonicalUrl || undefined,
    image: product?.mainImage?.url ?? product?.images[0]?.url,
    type: 'product',
  });

  // Part 25/46/47 — the backend computes this from the SAME
  // authoritative `inStock`/`basePrice` this response already carries
  // (product-search.service.ts / structured-data.util.ts), respecting the
  // SEO Configuration's structuredDataEnabled toggle; this used to be
  // rebuilt here client-side with a HARDCODED `availability: InStock`
  // regardless of real stock — a real bug, now fixed by trusting the
  // server's value instead of re-deriving it.
  useStructuredData(product?.structuredData ?? null);
  useStructuredData(product?.faqStructuredData ?? null);

  if (isLoading || !product) {
    return (
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // (Product Image Management) Part 10-14/22 — the gallery is driven
  // by the server-computed main image + ordered sub images (Part 6's
  // sortOrder), never a raw re-read of the flat legacy `images` array; the
  // main image is always index 0 / the default-selected image (Part 11),
  // with `product.images` kept only as a defense-in-depth fallback for the
  // (should-never-happen) case the backend didn't compute `mainImage`.
  const images =
    product.mainImage || product.subImages.length > 0
      ? [
          ...(product.mainImage ? [{ url: product.mainImage.url, isMain: true }] : []),
          ...product.subImages.map((img) => ({ url: img.url, isMain: false })),
        ]
      : product.images.length > 0
        ? product.images.map((img) => ({ url: img.url, isMain: img.isPrimary }))
        : [{ url: '', isMain: true }];
  const current = images[activeImage] ?? images[0];
  const discountPct =
    product.mrp > product.basePrice ? Math.round((1 - product.basePrice / product.mrp) * 100) : 0;
  const relatedProducts = (related?.items ?? []).filter((p) => p._id !== product._id).slice(0, 4);

  return (
    <div className="flex flex-col gap-6 pb-20 md:gap-10 md:pb-0">
      <Breadcrumb
        items={[
          { label: 'Products', to: '/products' },
          ...(categoryName ? [{ label: categoryName, to: `/products?categoryId=${product.categoryId}` }] : []),
          { label: product.name },
        ]}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/*  (Product Image Management) Part 10/15/16 — Amazon-style
            layout as a UX reference only (own KarienLabs styling, not their
            branding): a thumbnail rail beside the large image on desktop
            (`md:flex-row`, rail on the left), collapsing to a horizontal,
            swipeable thumbnail strip BELOW the large image on mobile
            (`flex-col` default). `min-w-0` on both flex children is load-
            bearing — without it a long thumbnail rail or wide image can
            force the row wider than the viewport (horizontal page overflow,
            explicitly disallowed by Part 16/33). */}
        <div className="flex min-w-0 flex-col gap-3 md:flex-row">
          {/* Part 16 — mobile order is LARGE IMAGE first, thumbnails below
              (`order-2`/`order-1` below); desktop swaps to the thumbnail
              rail on the left via `md:order-1`/`md:order-2`. */}
          {images.length > 1 && (
            <div className="order-2 flex min-w-0 flex-shrink-0 gap-2 overflow-x-auto pb-1 md:order-1 md:w-20 md:flex-col md:overflow-y-auto md:overflow-x-visible md:pb-0 md:[max-height:28rem]">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={img.isMain ? 'Main image' : `Image ${i + 1}`}
                  aria-current={i === activeImage}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                    i === activeImage
                      ? 'border-accent'
                      : 'border-gray-200 hover:border-gray-300 dark:border-night-border dark:hover:border-gray-600'
                  }`}
                >
                  <img
                    src={cloudinaryUrl(img.url, CLOUDINARY_PRESETS.galleryThumbnail)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => current.url && setZoomOpen(true)}
            className="order-1 flex h-80 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-night-elevated sm:h-96 md:order-2"
          >
            {current.url ? (
              <img
                src={cloudinaryUrl(current.url, CLOUDINARY_PRESETS.galleryMain)}
                alt={product.name}
                className="h-full w-full cursor-zoom-in object-contain"
              />
            ) : (
              <span className="text-sm text-gray-400 dark:text-night-muted">No image available</span>
            )}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {product.brand && (
            <Link
              to={`/products?brandId=${product.brand._id}`}
              className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-accent dark:text-night-muted"
            >
              {product.brand.name}
            </Link>
          )}
          {product.medicine?.prescriptionRequired && (
            <Badge tone="yellow">Prescription Required</Badge>
          )}
          <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
            {product.name}
          </h1>
          {product.medicine?.genericName && (
            <p className="text-sm text-gray-500 dark:text-night-muted">
              Generic: {product.medicine.genericName}
            </p>
          )}
          {!!product.ratingCount && (
            <RatingStars value={product.ratingAvg ?? 0} count={product.ratingCount} />
          )}

          <Badge tone={product.inStock ? 'green' : 'red'}>
            {product.inStock ? 'In Stock' : 'Out of Stock'}
          </Badge>

          <div className="flex flex-wrap items-baseline gap-2 border-t border-pale-sage pt-3 dark:border-night-border">
            <span className="font-brentis-body text-3xl font-bold text-ink dark:text-night-text">
              {formatCurrency(product.basePrice)}
            </span>
            {discountPct > 0 && (
              <>
                <span className="text-base text-gray-400 line-through dark:text-night-muted">
                  {formatCurrency(product.mrp)}
                </span>
                <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-sm font-semibold text-secondary">
                  {discountPct}% OFF
                </span>
              </>
            )}
          </div>
          <span className="-mt-2 text-xs text-gray-400 dark:text-night-muted">
            Inclusive of {product.gstRate}% GST
          </span>

          <p className="text-sm leading-relaxed text-gray-600 dark:text-night-muted">
            {product.shortDescription || product.description}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center rounded-full border border-pale-sage dark:border-night-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                className="px-3.5 py-2 text-gray-500 hover:text-ink dark:text-night-muted dark:hover:text-night-text"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-medium text-ink dark:text-night-text">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                className="px-3.5 py-2 text-gray-500 hover:text-ink dark:text-night-muted dark:hover:text-night-text"
                onClick={() => setQuantity((q) => q + 1)}
              >
                +
              </button>
            </div>
            <div className="flex flex-1 gap-2">
              <Button
                variant="teal"
                className="flex-1"
                isLoading={add.isPending}
                disabled={!product.inStock}
                onClick={() => {
                  add.mutate({ productId: product._id, quantity });
                  trackAddToCart({
                    item_id: product._id,
                    item_name: product.name,
                    item_category: product.categoryId,
                    price: product.basePrice,
                    quantity,
                  });
                }}
              >
                {product.inStock ? 'Add to cart' : 'Out of stock'}
              </Button>
              {product.inStock && (
                <Link to="/checkout" className="flex-1">
                  <Button
                    variant="coral"
                    className="w-full"
                    onClick={() => {
                      add.mutate({ productId: product._id, quantity });
                      trackAddToCart({
                        item_id: product._id,
                        item_name: product.name,
                        item_category: product.categoryId,
                        price: product.basePrice,
                        quantity,
                      });
                    }}
                  >
                    Buy now
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-pale-sage bg-white p-4 text-sm dark:border-night-border dark:bg-night-surface">
            {product.brand && (
              <div>
                <dt className="font-medium text-gray-700 dark:text-night-text">Brand</dt>
                <dd className="text-gray-500 dark:text-night-muted">
                  <Link to={`/products?brandId=${product.brand._id}`} className="hover:text-accent hover:underline">
                    {product.brand.name}
                  </Link>
                </dd>
              </div>
            )}
            {product.manufacturer && (
              <div>
                <dt className="font-medium text-gray-700 dark:text-night-text">Manufacturer</dt>
                <dd className="text-gray-500 dark:text-night-muted">
                  <Link
                    to={`/products?manufacturerId=${product.manufacturer._id}`}
                    className="hover:text-accent hover:underline"
                  >
                    {product.manufacturer.name}
                  </Link>
                </dd>
              </div>
            )}
            {product.medicine?.composition && (
              <div className="col-span-2">
                <dt className="font-medium text-gray-700 dark:text-night-text">Composition</dt>
                <dd className="text-gray-500 dark:text-night-muted">{product.medicine.composition}</dd>
              </div>
            )}
            {product.medicine?.strength && (
              <div>
                <dt className="font-medium text-gray-700 dark:text-night-text">Strength</dt>
                <dd className="text-gray-500 dark:text-night-muted">{product.medicine.strength}</dd>
              </div>
            )}
            {product.medicine?.dosageForm && (
              <div>
                <dt className="font-medium text-gray-700 dark:text-night-text">Form</dt>
                <dd className="text-gray-500 dark:text-night-muted capitalize">{product.medicine.dosageForm}</dd>
              </div>
            )}
            {product.medicine?.storageInstructions && (
              <div className="col-span-2">
                <dt className="font-medium text-gray-700 dark:text-night-text">Storage</dt>
                <dd className="text-gray-500 dark:text-night-muted">{product.medicine.storageInstructions}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Sticky mobile purchase bar — desktop already has the Add to
          Cart/Buy Now pair inline above and doesn't need this duplicated. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-pale-sage bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(23,43,47,0.08)] dark:border-night-border dark:bg-night-surface md:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gray-500 dark:text-night-muted">{product.name}</p>
          <p className="text-base font-bold text-ink dark:text-night-text">{formatCurrency(product.basePrice)}</p>
        </div>
        <Button
          variant="coral"
          disabled={!product.inStock}
          isLoading={add.isPending}
          onClick={() => {
            add.mutate({ productId: product._id, quantity });
            trackAddToCart({
              item_id: product._id,
              item_name: product.name,
              item_category: product.categoryId,
              price: product.basePrice,
              quantity,
            });
          }}
        >
          {product.inStock ? 'Add to cart' : 'Out of stock'}
        </Button>
      </div>

      <ProductReviews productId={product._id} />

      {/* Part 28/29 — visible FAQ content, admin-authored only (never generated); the same entries also back the FAQPage JSON-LD above. */}
      {!!product.faq?.length && (
        <section>
          <h2 className="mb-3 font-brentis-display text-lg font-semibold text-ink dark:text-night-text">
            Frequently Asked Questions
          </h2>
          <dl className="flex flex-col gap-4">
            {product.faq.map((entry, i) => (
              <div key={i}>
                <dt className="font-medium text-gray-800 dark:text-night-text">{entry.question}</dt>
                <dd className="mt-1 text-sm text-gray-600 dark:text-night-muted">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {relatedProducts.length > 0 && (
        <section>
          <h2 className="mb-3 font-brentis-display text-lg font-semibold text-ink dark:text-night-text">
            Related Products
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewedProducts excludeId={product._id} />

      <Modal isOpen={zoomOpen} onClose={() => setZoomOpen(false)} size="xl" title={product.name}>
        <img src={current.url} alt={product.name} className="w-full rounded-md object-contain" />
      </Modal>
    </div>
  );
}
