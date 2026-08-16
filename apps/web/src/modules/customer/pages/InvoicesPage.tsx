import { useQuery } from '@tanstack/react-query';

import { listMyInvoices } from '../../../api/invoices.api';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { formatCurrency, formatDate } from '../../../utils/format';

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['my-invoices'],
    queryFn: listMyInvoices,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Invoices</h1>

      {isLoading ? (
        <SkeletonRows rows={3} columns={3} />
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Invoices appear here once your order has been packed and is ready to ship."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((invoice) => (
            <Card key={invoice._id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {invoice.invoiceNumber}
                </p>
                <p className="text-xs text-gray-500">{formatDate(invoice.createdAt)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(invoice.totals.grandTotal)}
                </span>
                {invoice.pdfUrl ? (
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">Generating…</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
