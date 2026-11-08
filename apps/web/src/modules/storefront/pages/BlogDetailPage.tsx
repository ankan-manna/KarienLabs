import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { getPublicBlog } from '../../../api/public-cms.api';
import { Badge } from '../../../components/common/Badge';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta, useStructuredData } from '../../../hooks/useDocumentMeta';
import { formatDate } from '../../../utils/format';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';

export default function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: blog, isLoading, isError } = useQuery({
    queryKey: ['public-blog', slug],
    queryFn: () => getPublicBlog(slug as string),
    enabled: !!slug,
    retry: false,
  });

  useDocumentMeta({
    title: blog?.seo?.metaTitle || blog?.title || 'Blog',
    description: blog?.seo?.metaDescription || blog?.excerpt,
    image: blog?.coverImageUrl,
    type: 'article',
  });

  useStructuredData(
    blog
      ? {
          '@type': 'BlogPosting',
          headline: blog.title,
          description: blog.excerpt,
          image: blog.coverImageUrl ? [blog.coverImageUrl] : undefined,
          datePublished: blog.publishedAt,
          author: { '@type': 'Person', name: typeof blog.authorId === 'object' ? blog.authorId.name : 'BRENTIS HEALTHCARE' },
        }
      : null,
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (isError || !blog) {
    return <EmptyState title="Post not found" description="This blog post may have been removed." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Blog', to: '/blog' }, { label: blog.title }]} />
      <article className="mx-auto w-full max-w-3xl">
        {blog.coverImageUrl && (
          <img
            src={blog.coverImageUrl}
            alt={blog.title}
            className="mb-6 h-56 w-full rounded-xl object-cover shadow-storefront-md sm:h-80 lg:h-96"
          />
        )}
        <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
          {blog.title}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-night-muted">
          <span>{formatDate(blog.publishedAt)}</span>
          {typeof blog.authorId === 'object' && <span>· {blog.authorId.name}</span>}
        </div>
        {blog.tags.length > 0 && (
          <div className="mt-2 flex gap-2">
            {blog.tags.map((tag) => (
              <Badge key={tag} tone="gray">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div
          className="mt-6 text-sm leading-relaxed text-gray-700 [&_a]:text-accent [&_a]:underline [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-brentis-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:dark:text-night-text [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(blog.content) }}
        />
      </article>
    </div>
  );
}
