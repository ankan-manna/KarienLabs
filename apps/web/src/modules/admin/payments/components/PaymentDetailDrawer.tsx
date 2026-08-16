import { useState } from 'react';

import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { EntityDrawer } from '../../../../components/common/EntityDrawer';
import { Skeleton } from '../../../../components/common/Skeleton';
import { formatCurrency, formatDateTime } from '../../../../utils/format';
import { usePaymentDetail, useIssueRefund } from '../hooks/useAdminPayments';

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  captured: 'green',
  pending: 'yellow',
  failed: 'red',
  refunded: 'gray',
};

interface PaymentDetailDrawerProps {
  paymentId: string | null;
  onClose: () => void;
}

export function PaymentDetailDrawer({ paymentId, onClose }: PaymentDetailDrawerProps) {
  const { data, isLoading } = usePaymentDetail(paymentId);
  const refundMutation = useIssueRefund();
  const [confirmingRefund, setConfirmingRefund] = useState(false);

  if (!paymentId) return null;
  const payment = data?.payment;

  return (
    <EntityDrawer
      isOpen={!!paymentId}
      onClose={onClose}
      title={payment ? `Payment ${payment.razorpayOrderId}` : 'Payment'}
      resource="payments"
      resourceId={paymentId}
      meta={{ createdAt: payment?.createdAt }}
      general={
        isLoading || !payment ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-gray-500">Amount</dt>
              <dd>{formatCurrency(payment.amount / 100)}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <Badge tone={STATUS_TONE[payment.status] ?? 'gray'}>{payment.status}</Badge>
              </dd>
              <dt className="text-gray-500">Method</dt>
              <dd>{payment.method || '—'}</dd>
              <dt className="text-gray-500">Razorpay Order</dt>
              <dd className="font-mono text-xs">{payment.razorpayOrderId}</dd>
              <dt className="text-gray-500">Razorpay Payment</dt>
              <dd className="font-mono text-xs">{payment.razorpayPaymentId ?? '—'}</dd>
              <dt className="text-gray-500">Date</dt>
              <dd>{formatDateTime(payment.createdAt)}</dd>
              {payment.failureReason && (
                <>
                  <dt className="text-gray-500">Note</dt>
                  <dd>{payment.failureReason}</dd>
                </>
              )}
            </dl>

            {payment.reconciliationError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                <p className="font-medium">Needs reconciliation</p>
                <p className="mt-1">
                  This payment was captured by Razorpay, but the order could not be finalized
                  automatically: {payment.reconciliationError}
                </p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  The money has not been lost. Investigate (stock/coupon availability) and retry,
                  or issue a refund below if the order cannot be fulfilled.
                </p>
              </div>
            )}

            {payment.status === 'captured' && (
              <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
                <Can I="refund" a="payments">
                  <Button variant="danger" onClick={() => setConfirmingRefund(true)}>
                    Issue Refund
                  </Button>
                </Can>
              </div>
            )}

            <ConfirmDialog
              isOpen={confirmingRefund}
              title="Issue refund"
              message="Refund the full amount for this payment via Razorpay? This can't be undone."
              confirmLabel="Refund"
              isDangerous
              isLoading={refundMutation.isPending}
              onConfirm={async () => {
                await refundMutation.mutateAsync({ id: paymentId });
                setConfirmingRefund(false);
              }}
              onCancel={() => setConfirmingRefund(false)}
            />
          </div>
        )
      }
      related={
        data?.order ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-gray-500">Order #</dt>
            <dd>{String(data.order.orderNumber)}</dd>
            <dt className="text-gray-500">Order Status</dt>
            <dd>
              <Badge tone="gray">{String(data.order.status)}</Badge>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-gray-500">No linked order</p>
        )
      }
    />
  );
}
