import { useQuery } from '@tanstack/react-query';

import { getPublicPage } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';

/**
 * Generic slug-driven CMS page renderer — backs About Us, Privacy Policy, Terms,
 * Return/Shipping/Cancellation/Refund Policy. Content is admin-managed HTML from
 * the CMS Pages module (Prompt 5), run through `sanitizeHtml` (DOMPurify) before
 * render — an admin-account compromise or a future "suggest an edit" feature
 * would otherwise be a stored-XSS vector, so this isn't skipped just because the
 * author is trusted-by-role.
 */
export function CmsPageView({ slug }: { slug: string }) {
  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['cms-page', slug],
    queryFn: () => getPublicPage(slug),
    retry: false,
  });

  useDocumentMeta({
    title: page?.seo?.metaTitle || page?.title || 'Page',
    description: page?.seo?.metaDescription,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (isError || !page) {
    return (
      <EmptyState
        title="Page not available"
        description="This page hasn't been published yet. Please check back soon."
      />
    );
  }

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{page.title}</h1>
      <div
        className="cms-content max-w-none text-sm leading-relaxed text-gray-700 [&_a]:text-brand-600 [&_a]:underline [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 dark:text-gray-300"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }}
      />
    </article>
  );
}
