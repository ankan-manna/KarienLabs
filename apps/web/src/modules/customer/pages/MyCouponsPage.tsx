import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { listAvailableCoupons } from '../../../api/coupons.api';
import { listMyOrders } from '../../../api/orders.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { formatCurrency, formatDate } from '../../../utils/format';
import { toast } from '../../../utils/toast';

export default function MyCouponsPage() {
  const { data: coupons, isLoading } = useQuery({
    queryKey: ['coupons', 'available'],
    queryFn: listAvailableCoupons,
  });
  const { data: orders } = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  const couponHistory = (orders ?? []).filter((o) => !!o.couponCode);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyCode(code: string) {
    function onCopied() {
      setCopiedCode(code);
      toast.success(`Copied "${code}" — apply it at checkout`);
      setTimeout(() => setCopiedCode(null), 2000);
    }

    if (!navigator.clipboard) {
      // Clipboard API unavailable (non-secure context, unsupported browser, or
      // permission denied) — fall back to a hidden-textarea + execCommand copy
      // rather than failing silently.
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        onCopied();
      } catch {
        toast.error(`Could not copy automatically — the code is "${code}"`);
      } finally {
        document.body.removeChild(textarea);
      }
      return;
    }

    navigator.clipboard.writeText(code).then(onCopied, () => {
      toast.error(`Could not copy automatically — the code is "${code}"`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Available Coupons</h1>

      {isLoading ? (
        <SkeletonRows rows={3} columns={1} />
      ) : !coupons || coupons.length === 0 ? (
        <EmptyState title="No coupons available" description="Check back soon for offers." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {coupons.map((coupon) => (
            <Card key={coupon._id} className="flex flex-col gap-2 border-dashed p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-brand-600">{coupon.code}</span>
                <Badge tone="green">
                  {coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`}
                </Badge>
              </div>
              {coupon.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300">{coupon.description}</p>
              )}
              <p className="text-xs text-gray-400">
                {coupon.minCartValue > 0 && `Min. cart value ₹${coupon.minCartValue} · `}
                Valid till {formatDate(coupon.validTo)}
              </p>
              <Button variant="outline" size="sm" onClick={() => copyCode(coupon.code)}>
                {copiedCode === coupon.code ? 'Copied!' : 'Copy code'}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Coupon History
      </h2>
      {couponHistory.length === 0 ? (
        <p className="text-sm text-gray-500">You haven&apos;t used a coupon on any order yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {couponHistory.map((order) => (
            <Link key={order._id} to={`/account/orders/${order._id}`}>
              <Card className="flex items-center justify-between p-3 hover:border-brand-300">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-brand-600">
                    {order.couponCode}
                  </span>
                  <span className="text-xs text-gray-400">{order.orderNumber}</span>
                  <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                </div>
                <span className="text-sm font-medium text-green-600">
                  -{formatCurrency(order.totals.discount)}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
