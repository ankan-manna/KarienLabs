import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPublicPage } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';

const POLICY_NAVIGATION = [
  {
    slug: 'about-us',
    label: 'About Us',
    path: '/about',
    category: 'COMPANY OVERVIEW',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    slug: 'terms-and-conditions',
    label: 'Terms & Conditions',
    path: '/terms',
    category: 'LEGAL AGREEMENT',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    slug: 'privacy-policy',
    label: 'Privacy Policy',
    path: '/privacy-policy',
    category: 'LEGAL AGREEMENT',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    slug: 'shipping-policy',
    label: 'Shipping Policy',
    path: '/shipping-policy',
    category: 'CUSTOMER SERVICE',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" />
      </svg>
    ),
  },
  {
    slug: 'return-policy',
    label: 'Return Policy',
    path: '/return-policy',
    category: 'CUSTOMER SERVICE',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
      </svg>
    ),
  },
  {
    slug: 'cancellation-policy',
    label: 'Cancellation Policy',
    path: '/cancellation-policy',
    category: 'CUSTOMER SERVICE',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    slug: 'refund-policy',
    label: 'Refund Policy',
    path: '/refund-policy',
    category: 'CUSTOMER SERVICE',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
];

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
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="hidden lg:col-span-3 lg:block space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="lg:col-span-9 space-y-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <EmptyState
          title="Page not available"
          description="This page hasn't been published yet. Please check back soon."
        />
      </div>
    );
  }

  const activeNav = POLICY_NAVIGATION.find((n) => n.slug === slug);
  const documentCategory = activeNav?.category || 'DOCUMENT';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Breadcrumb items={[{ label: page.title }]} />
      </div>
      {/* Mobile navigation slider list */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none lg:hidden">
        {POLICY_NAVIGATION.map((item) => {
          const isActive = item.slug === slug;
          return (
            <Link
              key={item.slug}
              to={item.path}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-sm transition-all duration-300 ${
                isActive
                  ? 'bg-primary text-white shadow-md shadow-primary/10'
                  : 'bg-white/90 text-gray-600 border border-pale-sage hover:bg-deep-teal dark:bg-night-surface/90 dark:text-gray-400 dark:border-night-border dark:hover:bg-night-elevated'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-24 space-y-1.5 rounded-2xl bg-white/50 p-4 border border-pale-sage dark:bg-night-surface/50 dark:border-night-border backdrop-blur-sm">
            <h3 className="px-3 mb-3 text-xs font-bold tracking-wider text-gray-400 dark:text-night-muted uppercase">
              Information Center
            </h3>
            {POLICY_NAVIGATION.map((item) => {
              const isActive = item.slug === slug;
              return (
                <Link
                  key={item.slug}
                  to={item.path}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300 group ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/10 translate-x-1'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-night-surface hover:text-primary border border-transparent hover:border-pale-sage dark:hover:border-night-border'
                  }`}
                >
                  <span className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary'}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-9">
          <article className="rounded-3xl bg-white/95 dark:bg-night-surface/95 border border-pale-sage dark:border-night-border/80 p-6 sm:p-10 shadow-xl backdrop-blur-md">
            <div className="mb-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-deep-teal dark:bg-night-elevated px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                {documentCategory}
              </span>
              <h1 className="mt-4 font-brentis-display text-3xl font-extrabold text-ink dark:text-night-text sm:text-4xl">
                {page.title}
              </h1>
              <div className="mt-6 border-b border-pale-sage dark:border-night-border" />
            </div>

            <div
              className="cms-content max-w-none text-[15px] leading-relaxed text-gray-600 dark:text-gray-300
                [&_a]:text-accent [&_a]:underline [&_a]:font-semibold [&_a]:transition-colors hover:[&_a]:text-primary
                [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:dark:text-night-text [&_h2]:border-l-4 [&_h2]:border-primary [&_h2]:pl-3 [&_h2]:flex [&_h2]:items-center
                [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:dark:text-night-text
                [&_p]:mb-5 [&_p]:leading-relaxed
                [&_strong]:font-bold [&_strong]:text-ink [&_strong]:dark:text-night-text
                [&_ul]:my-5 [&_ul]:pl-5 [&_ul]:space-y-2
                [&_ol]:my-5 [&_ol]:pl-5 [&_ol]:space-y-2 [&_ol]:list-decimal
                [&_li]:list-disc [&_li]:marker:text-primary [&_li]:pl-1
                [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-pale-sage [&_blockquote]:dark:border-night-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-500 [&_blockquote]:dark:text-gray-400
                [&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_table]:text-left [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:border [&_table]:border-pale-sage [&_table]:dark:border-night-border
                [&_thead]:bg-deep-teal/75 [&_thead]:dark:bg-night-elevated/75
                [&_th]:py-3 [&_th]:px-4 [&_th]:font-bold [&_th]:text-ink [&_th]:dark:text-night-text [&_th]:border-b [&_th]:border-pale-sage [&_th]:dark:border-night-border
                [&_td]:py-3 [&_td]:px-4 [&_td]:text-gray-600 [&_td]:dark:text-gray-300 [&_td]:border-b [&_td]:border-pale-sage/50 [&_td]:dark:border-night-border/50
              "
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }}
            />
          </article>
        </main>
      </div>
    </div>
  );
}
