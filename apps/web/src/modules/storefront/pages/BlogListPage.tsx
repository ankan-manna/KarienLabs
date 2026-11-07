import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { listPublicBlogs } from '../../../api/public-cms.api';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { Pagination } from '../../../components/common/Pagination';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { formatDate } from '../../../utils/format';

export default function BlogListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const limit = 9;

  const { data, isLoading } = useQuery({
    queryKey: ['public-blogs', page],
    queryFn: () => listPublicBlogs({ page, limit }),
  });

  useDocumentMeta({
    title: 'Health & Wellness Blog',
    description: 'Tips, guides, and news from the BRENTIS HEALTHCARE pharmacist team.',
  });

  function goToPage(next: number) {
    setPage(next);
    const params = new URLSearchParams(searchParams);
    if (next > 1) params.set('page', String(next));
    else params.delete('page');
    setSearchParams(params, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Blog' }]} />
      <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
        Health & Wellness Blog
      </h1>
      {isLoading ? (
        <SkeletonRows rows={3} columns={3} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No posts yet" description="Check back soon for health tips and guides." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((blog) => (
              <Link key={blog._id} to={`/blog/${blog.slug}`}>
                <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-storefront-hover">
                  <div className="flex h-40 items-center justify-center overflow-hidden bg-gray-50 dark:bg-night-elevated">
                    {blog.coverImageUrl ? (
                      <img
                        src={blog.coverImageUrl}
                        alt={blog.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-night-muted">No image</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <span className="text-xs text-gray-400 dark:text-night-muted">
                      {formatDate(blog.publishedAt)}
                    </span>
                    <h2 className="line-clamp-2 font-brentis-display text-sm font-semibold text-ink dark:text-night-text">
                      {blog.title}
                    </h2>
                    <p className="line-clamp-3 text-xs text-gray-500 dark:text-night-muted">
                      {blog.excerpt}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              limit={limit}
              total={data.meta.total}
              onPageChange={goToPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
