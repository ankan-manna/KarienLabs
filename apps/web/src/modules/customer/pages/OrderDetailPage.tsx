import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@medcommerce/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getInvoiceDownloadUrl } from '../../../api/invoices.api';
import { cancelOrder, getMyOrderDetail } from '../../../api/orders-admin.api';
import { requestReturn } from '../../../api/returns.api';
import { uploadImageDirect } from '../../../api/uploads.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Checkbox } from '../../../components/common/Checkbox';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { Modal } from '../../../components/common/Modal';
import { Select } from '../../../components/common/Select';
import { Skeleton } from '../../../components/common/Skeleton';
import { Textarea } from '../../../components/common/Textarea';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { toast } from '../../../utils/toast';
import { useCartMutations } from '../../storefront/hooks/useCart';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  placed: 'blue',
  confirmed: 'blue',
  packed: 'yellow',
  shipped: 'yellow',
  delivered: 'green',
  returned: 'red',
  cancelled: 'red',
};

const RETURN_STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  requested: 'blue',
  approved: 'yellow',
  rejected: 'red',
  picked_up: 'yellow',
  received: 'yellow',
  inspected: 'yellow',
  refunded: 'green',
  replaced: 'green',
};

// Server-validated (Part 2 — never trust frontend eligibility); this list is
// only the reason vocabulary offered in the form, the actual window is
// enforced by the backend and its exact remaining-days message is surfaced
// via a toast if a request is rejected.
const RETURN_REASON_OPTIONS = [
  { label: 'Damaged on arrival', value: 'damaged' },
  { label: 'Wrong product received', value: 'wrong_product' },
  { label: 'Expired / near expiry', value: 'expired_near_expiry' },
  { label: 'Item missing from order', value: 'missing_item' },
  { label: 'Quality issue', value: 'quality_issue' },
  { label: 'Changed my mind', value: 'customer_preference' },
  { label: 'Other', value: 'other' },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { add } = useCartMutations();

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnDescription, setReturnDescription] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [reasonByItem, setReasonByItem] = useState<Record<string, string>>({});
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  // Part 10 — ONE composed request instead of four (order +
  // separate invoice/shipment/return round-trips); the backend now enriches
  // GET /orders/:id with invoice availability, shipment tracking, return
  // history, and refund status for the customer role — see
  // order.service.ts's getOrderDetailForCustomer.
  const { data: order, isLoading } = useQuery({
    queryKey: ['my-orders', 'detail', id],
    queryFn: () => getMyOrderDetail(id as string),
    enabled: !!id,
  });

  const invoice = order?.invoice;
  const shipment = order?.shipments?.[0];
  const orderReturns = order?.returns ?? [];

  const downloadInvoice = useMutation({
    // `print` isn't used by the request itself — kept on the input so both
    // callers share one mutation while still distinguishing their onSuccess.
    mutationFn: (_input: { print: boolean }) => getInvoiceDownloadUrl(id as string),
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelOrder(id as string, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast.success('Order cancelled');
      setCancelling(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      requestReturn({
        orderId: id as string,
        items: Array.from(selectedItemIds).map((orderItemId) => ({
          orderItemId,
          quantity: order!.items.find((i) => i._id === orderItemId)?.quantity ?? 1,
          reason: reasonByItem[orderItemId] || 'other',
          description: returnDescription.trim() || undefined,
          evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success('Return request submitted');
      queryClient.invalidateQueries({ queryKey: ['my-orders', 'returns', id] });
      setReturning(false);
      setSelectedItemIds(new Set());
      setReasonByItem({});
      setReturnDescription('');
      setEvidenceUrls([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !order) return <Skeleton className="h-64 w-full" />;

  const canCancel = (ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? []).includes(
    'cancelled' as OrderStatus,
  );

  // Eligibility (return window by reason, product returnability, remaining
  // quantity) is validated authoritatively server-side (Part 21/22) — this
  // coarse `returnEligible` flag from the backend just decides whether the
  // button is even offered; a specific rejection reason (e.g. "window
  // closed for this reason") surfaces via toast on submit.
  const canReturn = order.returnEligible;

  function handleReorder() {
    for (const item of order!.items) {
      add.mutate({ productId: item.productId, quantity: item.quantity });
    }
    navigate('/cart');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Order {order.orderNumber}
        </h1>
        <Badge tone={STATUS_TONE[order.status] ?? 'gray'}>{order.status}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleReorder}>
          Reorder
        </Button>
        {invoice?.available && (
          <>
            <Button
              variant="outline"
              size="sm"
              isLoading={downloadInvoice.isPending}
              onClick={() =>
                downloadInvoice.mutate(
                  { print: false },
                  { onSuccess: ({ url }) => window.open(url, '_blank') },
                )
              }
            >
              Download Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={downloadInvoice.isPending}
              onClick={() =>
                downloadInvoice.mutate(
                  { print: true },
                  {
                    onSuccess: ({ url }) => {
                      const win = window.open(url, '_blank');
                      win?.addEventListener('load', () => win.print());
                    },
                  },
                )
              }
            >
              Print Invoice
            </Button>
          </>
        )}
        {canCancel && (
          <Button variant="danger" size="sm" onClick={() => setCancelling(true)}>
            Cancel Order
          </Button>
        )}
        {canReturn && (
          <Button variant="outline" size="sm" onClick={() => setReturning(true)}>
            Request Return
          </Button>
        )}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Items</h2>
        <table className="w-full text-left text-sm">
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="py-1.5">
                  {item.name} <span className="text-gray-400">× {item.quantity}</span>
                </td>
                <td className="py-1.5 text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>{formatCurrency(order.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>GST</span>
            <span>{formatCurrency(order.totals.gst)}</span>
          </div>
          {order.totals.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(order.totals.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
            <span>Total</span>
            <span>{formatCurrency(order.totals.grandTotal)}</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Order Timeline
        </h2>
        <ol className="space-y-2 border-l border-gray-200 pl-4 dark:border-gray-800">
          {order.statusHistory.map((event, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium capitalize text-gray-800 dark:text-gray-200">
                {event.status}
              </span>
              <span className="ml-2 text-gray-400">{formatDateTime(event.changedAt)}</span>
            </li>
          ))}
        </ol>
      </Card>

      {shipment && (shipment.awbCode || shipment.trackingEvents.length > 0) && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Shipment Tracking
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Status</p>
              <Badge tone={shipment.status === 'delivered' ? 'green' : 'blue'}>
                {shipment.status}
              </Badge>
            </div>
            {shipment.awbCode && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">AWB</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">{shipment.awbCode}</p>
              </div>
            )}
            {shipment.courierName && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Courier</p>
                <p className="text-gray-900 dark:text-gray-100">{shipment.courierName}</p>
              </div>
            )}
            {shipment.estimatedDeliveryDate && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Estimated Delivery</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {formatDateTime(shipment.estimatedDeliveryDate)}
                </p>
              </div>
            )}
          </div>
          {shipment.trackingEvents.length > 0 && (
            <ol className="mt-3 space-y-2 border-l border-gray-200 pl-4 dark:border-gray-800">
              {shipment.trackingEvents.map((event, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium capitalize text-gray-800 dark:text-gray-200">
                    {event.status}
                  </span>
                  <span className="ml-2 text-gray-400">{formatDateTime(event.timestamp)}</span>
                  {event.location && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">{event.location}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {orderReturns.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Return Requests
          </h2>
          <div className="flex flex-col gap-3">
            {orderReturns.map((ret) => (
              <div key={ret._id} className="rounded-md border border-gray-100 p-3 text-sm dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-500">{ret.returnNumber || ret._id}</span>
                  <Badge tone={RETURN_STATUS_TONE[ret.status] ?? 'gray'}>{ret.status}</Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {ret.items.map((item, i) => (
                    <li key={i} className="text-gray-600 dark:text-gray-300">
                      {item.name || item.orderItemId} × {item.quantity} — {item.reason}
                    </li>
                  ))}
                </ul>
                {ret.rejectionReason && (
                  <p className="mt-1 text-red-600 dark:text-red-400">Rejected: {ret.rejectionReason}</p>
                )}
                {ret.reverseShipment?.awbCode && (
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    Pickup AWB: <span className="font-mono">{ret.reverseShipment.awbCode}</span>
                    {ret.reverseShipment.status && ` — ${ret.reverseShipment.status}`}
                  </p>
                )}
                {ret.resolutionType && (
                  <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                    Resolution: {ret.resolutionType === 'refund' ? 'Refunded' : 'Replacement order created'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        isOpen={cancelling}
        title="Cancel order"
        message={
          <Textarea
            label="Reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        }
        confirmLabel="Cancel order"
        isDangerous
        isLoading={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelReason.trim().length < 3) {
            toast.error('Please provide a reason');
            return;
          }
          cancelMutation.mutate(cancelReason);
        }}
        onCancel={() => setCancelling(false)}
      />

      <Modal isOpen={returning} onClose={() => setReturning(false)} title="Request Return">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">
            Select the items you&apos;d like to return and a reason for each — the return window
            depends on the reason selected.
          </p>
          {order.items.map((item) => (
            <div key={item._id} className="flex flex-col gap-2 rounded-md border border-gray-100 p-2 dark:border-gray-800">
              <Checkbox
                label={`${item.name} × ${item.quantity}`}
                checked={selectedItemIds.has(item._id)}
                onChange={(e) => {
                  setSelectedItemIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(item._id);
                    else next.delete(item._id);
                    return next;
                  });
                }}
              />
              {selectedItemIds.has(item._id) && (
                <Select
                  placeholder="Select a reason"
                  value={reasonByItem[item._id] ?? ''}
                  onChange={(e) =>
                    setReasonByItem((prev) => ({ ...prev, [item._id]: e.target.value }))
                  }
                  options={RETURN_REASON_OPTIONS}
                />
              )}
            </div>
          ))}
          <Textarea
            label="Additional details (optional)"
            value={returnDescription}
            onChange={(e) => setReturnDescription(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Photos (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingEvidence}
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;
                setUploadingEvidence(true);
                try {
                  const uploaded = await Promise.all(
                    files.map((file) => uploadImageDirect(file, 'return_evidence', 'returns')),
                  );
                  setEvidenceUrls((prev) => [...prev, ...uploaded.map((u) => u.url)]);
                } catch {
                  toast.error('Failed to upload one or more photos');
                } finally {
                  setUploadingEvidence(false);
                  e.target.value = '';
                }
              }}
              className="text-sm text-gray-500"
            />
            {uploadingEvidence && <p className="text-xs text-gray-400">Uploading...</p>}
            {evidenceUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evidenceUrls.map((url) => (
                  <img key={url} src={url} alt="Return evidence" className="h-16 w-16 rounded object-cover" />
                ))}
              </div>
            )}
          </div>
          <Button
            isLoading={returnMutation.isPending}
            disabled={
              selectedItemIds.size === 0 ||
              Array.from(selectedItemIds).some((itemId) => !reasonByItem[itemId]) ||
              uploadingEvidence
            }
            onClick={() => returnMutation.mutate()}
          >
            Submit return request
          </Button>
        </div>
      </Modal>
    </div>
  );
}
