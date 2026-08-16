import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getPublicFaqs } from '../../../api/public-cms.api';
import { EmptyState } from '../../../components/common/EmptyState';
import { Skeleton } from '../../../components/common/Skeleton';
import { useDocumentMeta, useStructuredData } from '../../../hooks/useDocumentMeta';
import { cn } from '../../../utils/cn';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 py-3 dark:border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-900 dark:text-gray-100"
      >
        {question}
        <span className={cn('ml-2 transition-transform', open && 'rotate-45')}>+</span>
      </button>
      {open && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{answer}</p>}
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
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Frequently Asked Questions
      </h1>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !faqs || faqs.length === 0 ? (
        <EmptyState title="No FAQs yet" description="Check back soon." />
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {category}
            </h2>
            {items?.map((faq) => (
              <FaqItem key={faq._id} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
