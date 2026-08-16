import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { listPublicBlogs } from '../../../api/public-cms.api';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { Pagination } from '../../../components/common/Pagination';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { formatDate } from '../../../utils/format';

export default function BlogListPage() {
  const [page, setPage] = useState(1);
  const limit = 9;

  const { data, isLoading } = useQuery({
    queryKey: ['public-blogs', page],
    queryFn: () => listPublicBlogs({ page, limit }),
  });

  useDocumentMeta({
    title: 'Health & Wellness Blog',
    description: 'Tips, guides, and news from the KarienLabs pharmacist team.',
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
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
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="flex h-40 items-center justify-center bg-gray-50 dark:bg-gray-800">
                    {blog.coverImageUrl ? (
                      <img
                        src={blog.coverImageUrl}
                        alt={blog.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">No image</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <span className="text-xs text-gray-400">{formatDate(blog.publishedAt)}</span>
                    <h2 className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {blog.title}
                    </h2>
                    <p className="line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
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
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
