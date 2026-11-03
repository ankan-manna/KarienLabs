import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getPublicFaqs } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta, useStructuredData } from '../../../hooks/useDocumentMeta';
import { cn } from '../../../utils/cn';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-pale-sage py-3 last:border-0 dark:border-night-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 text-left text-sm font-medium text-ink dark:text-night-text"
      >
        {question}
        <span
          className={cn(
            'flex h-5 w-5 flex-shrink-0 items-center justify-center text-lg text-primary transition-transform',
            open && 'rotate-45',
          )}
        >
          +
        </span>
      </button>
      {open && <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-night-muted">{answer}</p>}
    </div>
  );
}

export default function FaqPage() {
  const { data: faqs, isLoading } = useQuery({
    queryKey: ['public-faqs'],
    queryFn: () => getPublicFaqs(),
  });

  useDocumentMeta({
    title: 'Frequently Asked Questions',
    description: 'Answers to common questions about orders, prescriptions, shipping, and returns.',
  });

  useStructuredData(
    faqs && faqs.length > 0
      ? {
          '@type': 'FAQPage',
          mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null,
  );

  const grouped = (faqs ?? []).reduce<Record<string, typeof faqs>>((acc, faq) => {
    (acc[faq.category] ??= []).push(faq);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'FAQ' }]} />
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
          Frequently Asked Questions
        </h1>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !faqs || faqs.length === 0 ? (
          <EmptyState title="No FAQs yet" description="Check back soon." />
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-night-muted">
                {category}
              </h2>
              {items?.map((faq) => (
                <FaqItem key={faq._id} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
