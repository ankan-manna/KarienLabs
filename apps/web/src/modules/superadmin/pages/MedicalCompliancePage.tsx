import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getPrescriptionConfig, setPrescriptionConfig, type PrescriptionConfig } from '../../../api/prescriptions.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

/**
 * Prompt 17 Part 39 — the dedicated Super Admin / permitted Platform Admin
 * "Medical Compliance" configuration section. Deliberately its OWN page
 * (not a namespace added to the fully-generic ConfigurationPage) because
 * writes here MUST go through the validated /prescriptions/config endpoint
 * (whitelist + dependency checks, Part 40/43) rather than the generic
 * Configuration engine's unvalidated `PUT /configuration/:namespace`.
 */
export default function MedicalCompliancePage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PrescriptionConfig | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['prescription-config'],
    queryFn: getPrescriptionConfig,
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<PrescriptionConfig>) => setPrescriptionConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['prescription-config'] });
      toast.success('Prescription configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;

  function set<K extends keyof PrescriptionConfig>(key: K, value: PrescriptionConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const dependentsDisabled = !draft.managementEnabled;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Medical Compliance</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls the prescription-management workflow platform-wide. Disabling Prescription
        Management turns off every dependent setting below — existing historical prescriptions and
        orders are never deleted or corrupted by changing these.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="Prescription Management"
          checked={draft.managementEnabled}
          onChange={(checked) => set('managementEnabled', checked)}
        />

        <div className="ml-4 flex flex-col gap-4 border-l border-gray-100 pl-4 dark:border-gray-800">
          <Switch
            label="Prescription Upload"
            checked={draft.uploadEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('uploadEnabled', checked)}
          />
          <Switch
            label="Prescription Verification"
            checked={draft.verificationEnabled}
            disabled={dependentsDisabled || !draft.uploadEnabled}
            onChange={(checked) => set('verificationEnabled', checked)}
          />
          <Switch
            label="Prescription Reuse"
            checked={draft.reuseEnabled}
            disabled={dependentsDisabled || !draft.uploadEnabled}
            onChange={(checked) => set('reuseEnabled', checked)}
          />
          <Switch
            label="Order Blocking (require verification before packing)"
            checked={draft.orderBlockingEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('orderBlockingEnabled', checked)}
          />
          <Switch
            label="Require Upload at Checkout"
            checked={draft.checkoutUploadRequired}
            disabled={dependentsDisabled}
            onChange={(checked) => set('checkoutUploadRequired', checked)}
          />
          <Switch
            label="Prescription Validity"
            checked={draft.validityEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('validityEnabled', checked)}
          />
          <Input
            label="Validity Days"
            type="number"
            value={String(draft.validityDays)}
            disabled={dependentsDisabled || !draft.validityEnabled}
            onChange={(e) => set('validityDays', Number(e.target.value))}
          />
        </div>
      </Card>

      <Button
        className="w-fit"
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate(draft)}
      >
        Save configuration
      </Button>
    </div>
  );
}
