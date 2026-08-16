import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { brandApi } from '../../../api/catalog.api';
import { listCategoryTree, listProducts } from '../../../api/products-public.api';
import { getPublicBanners, getPublicHomeSections, listPublicBlogs } from '../../../api/public-cms.api';
import { listRecentTopReviews } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { RatingStars } from '../../../components/common/RatingStars';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackViewItemList } from '../../../lib/analytics';
import { formatDate } from '../../../utils/format';
import { ProductCard } from '../components/ProductCard';
import { RecentlyViewedProducts } from '../components/RecentlyViewedProducts';

function HeroBanner() {
  const { data: banners } = useQuery({
    queryKey: ['public-banners', 'hero'],
    queryFn: () => getPublicBanners('hero'),
  });
  const hero = banners?.[0];

  if (hero) {
    return (
      <Link to={hero.linkUrl || '/products'} className="block overflow-hidden rounded-xl">
        <img src={hero.imageUrl} alt={hero.title} className="w-full object-cover" />
      </Link>
    );
  }

  return (
    <section className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-8 py-12 text-white">
      <h1 className="text-2xl font-bold sm:text-3xl">Genuine medicines, delivered fast.</h1>
      <p className="mt-2 max-w-md text-brand-50">
        Order prescription and OTC medicines online with verified pharmacies.
      </p>
      <Link to="/products">
        <Button variant="secondary" className="mt-4">
          Browse products
        </Button>
      </Link>
    </section>
  );
}

function CategorySlider() {
  const { data: categories } = useQuery({
    queryKey: ['categories', 'tree', 'home'],
    queryFn: listCategoryTree,
  });
  if (!categories || categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Shop by Category
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <Link
            key={cat._id}
            to={`/products?categoryId=${cat._id}`}
            className="flex min-w-[110px] flex-col items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 text-center hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-lg dark:bg-brand-500/10">
              💊
            </div>
            <span className="line-clamp-2 text-xs font-medium text-gray-700 dark:text-gray-200">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HomeSections() {
  const { data: sections } = useQuery({
    queryKey: ['public-home-sections'],
    queryFn: getPublicHomeSections,
  });

  if (!sections || sections.length === 0) return null;

  return (
    <>
      {sections.map((section) => {
        if (section.type === 'category_grid' && section.categoryIds.length > 0) {
          return (
            <section key={section._id}>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {section.title}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {section.categoryIds.map((cat) => (
                  <Link
                    key={cat._id}
                    to={`/products?categoryId=${cat._id}`}
                    className="rounded-lg border border-gray-100 bg-white p-4 text-center text-sm font-medium text-gray-700 hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            </section>
          );
        }
        if (section.productIds.length > 0) {
          return (
            <section key={section._id}>
              <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {section.title}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {section.productIds.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={{
                      ...product,
                      gstRate: 0,
                      sku: '',
                      shortDescription: '',
                      description: '',
                      categoryId: '',
                      isActive: true,
                      mainImage: (() => {
                        const img = product.images.find((i) => i.isPrimary) ?? product.images[0];
                        return img ? { url: img.url, publicId: '' } : null;
                      })(),
                      subImages: [],
                    }}
                  />
                ))}
              </div>
            </section>
          );
        }
        return null;
      })}
    </>
  );
}

function TopBrands() {
  const { data } = useQuery({
    queryKey: ['brands', 'public', 'home'],
    queryFn: () => brandApi.list({ limit: 8 }),
  });
  if (!data || data.items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Brands</h2>
        <Link to="/brands" className="text-sm font-medium text-brand-600 hover:underline">
          View all
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {data.items.map((brand) => (
          <Link
            key={brand._id}
            to={`/products?brandId=${brand._id}`}
            className="flex min-w-[110px] flex-col items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 text-center hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"
          >
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-10 w-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-lg dark:bg-brand-500/10">
                🏷️
              </div>
            )}
            <span className="line-clamp-1 text-xs font-medium text-gray-700 dark:text-gray-200">
              {brand.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CustomerReviewsStrip() {
  const { data: reviews } = useQuery({
    queryKey: ['reviews', 'recent', 'home'],
    queryFn: listRecentTopReviews,
  });
  if (!reviews || reviews.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
        What Customers Say
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {reviews.map((review) => (
          <Card key={review._id} className="p-4">
            <RatingStars value={review.rating} size="sm" />
            {review.title && (
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {review.title}
              </p>
            )}
            <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
              {review.comment}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              — {typeof review.userId === 'object' ? review.userId.name : 'Verified customer'}
              {typeof review.productId === 'object' && `, on ${review.productId.name}`}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function BlogPreview() {
  const { data } = useQuery({
    queryKey: ['public-blogs', 'home'],
    queryFn: () => listPublicBlogs({ limit: 3 }),
  });
  if (!data || data.items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">From the Blog</h2>
        <Link to="/blog" className="text-sm font-medium text-brand-600 hover:underline">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.items.map((blog) => (
          <Link key={blog._id} to={`/blog/${blog.slug}`}>
            <Card className="p-4">
              <span className="text-xs text-gray-400">{formatDate(blog.publishedAt)}</span>
              <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {blog.title}
              </h3>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { data: fallbackProducts, isLoading } = useQuery({
    queryKey: ['products', 'home'],
    queryFn: () => listProducts({ limit: 8, sort: '-createdAt' }),
  });

  useDocumentMeta({
    title: 'Genuine medicines, delivered fast',
    description:
      'Order prescription and OTC medicines online from verified pharmacies. Fast delivery, GST invoices, and secure payments.',
  });

  useEffect(() => {
    if (fallbackProducts?.items.length) {
      trackViewItemList(
        fallbackProducts.items.map((p) => ({
          item_id: p._id,
          item_name: p.name,
          item_category: p.categoryId,
          price: p.basePrice,
        })),
        'New Arrivals',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fire when the result set changes
  }, [fallbackProducts]);

  return (
    <div className="flex flex-col gap-10">
      <HeroBanner />
      <CategorySlider />
      <HomeSections />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Arrivals</h2>
          <Link to="/products" className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {isLoading ? (
          <SkeletonRows rows={4} columns={4} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {fallbackProducts?.items.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>

      <TopBrands />
      <CustomerReviewsStrip />
      <BlogPreview />
      <RecentlyViewedProducts />
    </div>
  );
}
