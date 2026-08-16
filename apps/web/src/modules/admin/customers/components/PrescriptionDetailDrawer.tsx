import { useState } from 'react';

import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { formatDateTime } from '../../../../utils/format';
import { useAdminPrescription, useApprovePrescription, useRejectPrescription } from '../hooks/useAdminPrescriptions';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  expired: 'gray',
  cancelled: 'gray',
};

const REJECTION_REASON_OPTIONS = [
  { label: 'Unreadable', value: 'unreadable' },
  { label: 'Invalid document', value: 'invalid_document' },
  { label: 'Missing information', value: 'missing_information' },
  { label: 'Expired', value: 'expired' },
  { label: 'Wrong patient', value: 'wrong_patient' },
  { label: 'Wrong product', value: 'wrong_product' },
  { label: 'Other', value: 'other' },
];

export function PrescriptionDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: prescription, isLoading } = useAdminPrescription(id);
  const approve = useApprovePrescription();
  const reject = useRejectPrescription();
  const [showReject, setShowReject] = useState(false);
  const [rejectReasonCode, setRejectReasonCode] = useState('');
  const [rejectDetail, setRejectDetail] = useState('');

  return (
    <Drawer
      isOpen={!!id}
      onClose={() => {
        onClose();
        setShowReject(false);
        setRejectReasonCode('');
        setRejectDetail('');
      }}
      title={prescription ? `Prescription ${prescription._id.slice(-8)}` : 'Prescription'}
      width="md"
    >
      {isLoading || !prescription ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[prescription.status] ?? 'gray'}>{prescription.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(prescription.createdAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Customer</p>
              <p className="font-mono text-gray-900 dark:text-gray-100">{prescription.userId}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Order</p>
              <p className="font-mono text-gray-900 dark:text-gray-100">{prescription.orderId || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Storage</p>
              <Badge tone="gray">{prescription.storageProvider === 's3' ? 'S3' : 'Cloudinary'}</Badge>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Version</p>
              <p className="text-gray-900 dark:text-gray-100">
                {prescription.revisionNumber ?? 1}
                {prescription.previousVersionId && ' (re-upload)'}
              </p>
            </div>
            {prescription.expiryDate && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Valid Until</p>
                <p className="text-gray-900 dark:text-gray-100">{formatDateTime(prescription.expiryDate)}</p>
              </div>
            )}
            {prescription.rejectionReason && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Rejection Reason</p>
                <p className="text-red-600 dark:text-red-400">{prescription.rejectionReason}</p>
              </div>
            )}
          </div>

          {prescription.signedUrl && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Document</h3>
              {prescription.mimeType?.startsWith('image/') || !prescription.mimeType ? (
                <a href={prescription.signedUrl} target="_blank" rel="noreferrer">
                  <img
                    src={prescription.signedUrl}
                    alt="Prescription"
                    className="max-h-96 w-full rounded border border-gray-200 object-contain dark:border-gray-800"
                  />
                </a>
              ) : (
                <a
                  href={prescription.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline"
                >
                  View document (opens in a new tab, link expires shortly)
                </a>
              )}
            </div>
          )}

          <Can I="approve" a="prescriptions">
            <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Review</h3>
              {prescription.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" isLoading={approve.isPending} onClick={() => approve.mutate(prescription._id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setShowReject(true)}>
                    Reject
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No further action available.</p>
              )}
            </div>
          </Can>
        </div>
      )}

      <ConfirmDialog
        isOpen={showReject}
        title="Reject prescription"
        message={
          <div className="flex flex-col gap-2">
            <Select
              label="Reason"
              placeholder="Select a reason"
              value={rejectReasonCode}
              onChange={(e) => setRejectReasonCode(e.target.value)}
              options={REJECTION_REASON_OPTIONS}
            />
            <Textarea
              label="Additional detail"
              value={rejectDetail}
              onChange={(e) => setRejectDetail(e.target.value)}
              placeholder="Explain why this prescription is being rejected..."
              rows={3}
            />
          </div>
        }
        confirmLabel="Reject"
        isDangerous
        isLoading={reject.isPending}
        onConfirm={() => {
          if (!prescription) return;
          const label = REJECTION_REASON_OPTIONS.find((o) => o.value === rejectReasonCode)?.label;
          const combined = [label, rejectDetail.trim()].filter(Boolean).join(' — ');
          if (combined.trim().length < 3) return;
          reject.mutate(
            { id: prescription._id, reason: combined },
            { onSuccess: () => setShowReject(false) },
          );
        }}
        onCancel={() => setShowReject(false)}
      />
    </Drawer>
  );
}
