import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  cancelPrescription,
  listMyPrescriptions,
  reuploadPrescription,
  uploadPrescription,
  type Prescription,
} from '../../../api/prescriptions.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { formatDate } from '../../../utils/format';
import { toast } from '../../../utils/toast';

const STATUS_TONE = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  expired: 'gray',
  cancelled: 'gray',
} as const;

export default function PrescriptionsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reuploadTargetId, setReuploadTargetId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: prescriptions, isLoading } = useQuery({
    queryKey: ['my-prescriptions'],
    queryFn: listMyPrescriptions,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-prescriptions'] });

  const cancelMutation = useMutation({
    mutationFn: cancelPrescription,
    onSuccess: () => {
      invalidate();
      toast.success('Prescription upload cancelled');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadPrescription(file);
      invalidate();
      toast.success('Prescription uploaded for review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleReuploadFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !reuploadTargetId) return;

    setIsUploading(true);
    try {
      await reuploadPrescription(reuploadTargetId, file);
      invalidate();
      toast.success('New version uploaded for review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setReuploadTargetId(null);
      if (reuploadInputRef.current) reuploadInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Prescriptions</h1>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={reuploadInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={handleReuploadFileChange}
        />
        <Button isLoading={isUploading} onClick={() => inputRef.current?.click()}>
          Upload Prescription
        </Button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} columns={2} />
      ) : !prescriptions || prescriptions.length === 0 ? (
        <EmptyState
          title="No prescriptions uploaded"
          description="Upload a prescription to order restricted medicines."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {prescriptions.map((p: Prescription) => (
            <Card key={p._id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-gray-500">{formatDate(p.createdAt)}</p>
                {p.status === 'rejected' && p.rejectionReason && (
                  <p className="text-xs text-red-500">{p.rejectionReason}</p>
                )}
                {p.expiryDate && p.status === 'approved' && (
                  <p className="text-xs text-gray-400">Valid until {formatDate(p.expiryDate)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                {p.status === 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={isUploading && reuploadTargetId === p._id}
                    onClick={() => {
                      setReuploadTargetId(p._id);
                      reuploadInputRef.current?.click();
                    }}
                  >
                    Re-upload
                  </Button>
                )}
                {p.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="danger"
                    isLoading={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(p._id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
