import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { getPublicBlog } from '../../../api/public-cms.api';
import { Badge } from '../../../components/common/Badge';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
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
          '@type': 'Article',
          headline: blog.title,
          description: blog.excerpt,
          image: blog.coverImageUrl ? [blog.coverImageUrl] : undefined,
          datePublished: blog.publishedAt,
          author: { '@type': 'Person', name: typeof blog.authorId === 'object' ? blog.authorId.name : 'KarienLabs' },
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
    <article className="mx-auto max-w-3xl">
      {blog.coverImageUrl && (
        <img src={blog.coverImageUrl} alt={blog.title} className="mb-6 w-full rounded-lg object-cover" />
      )}
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-night-text">{blog.title}</h1>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
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
        className="mt-6 text-sm leading-relaxed text-gray-700 [&_a]:text-brand-600 [&_a]:underline [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 dark:text-gray-300"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(blog.content) }}
      />
    </article>
  );
}
