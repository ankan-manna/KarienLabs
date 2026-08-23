import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getCouponConfig, setCouponConfig, type CouponConfig } from '../../../api/coupons.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

/**
 * Part 9/53 — the dedicated Super Admin / permitted Platform
 * Admin "Coupon Settings" configuration page. Its OWN page (not a namespace
 * on the generic ConfigurationPage) for the same reason
 * MedicalCompliancePage is: writes must go through the validated
 * `/coupons/config` endpoint, not the generic unvalidated
 * `PUT /configuration/:namespace`.
 */
export default function CouponSettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CouponConfig | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['coupon-config'], queryFn: getCouponConfig });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<CouponConfig>) => setCouponConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['coupon-config'] });
      toast.success('Coupon configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-48 w-full" />;

  function set<K extends keyof CouponConfig>(key: K, value: CouponConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Coupon Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls the coupon/promotion system platform-wide. Disabling Coupon Management hides the
        feature from customers and Platform Admins alike, and the backend rejects any coupon API
        call — existing historical orders that already used a coupon are never affected.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="Coupon Management"
          checked={draft.managementEnabled}
          onChange={(checked) => set('managementEnabled', checked)}
        />
        <div className="ml-4 flex flex-col gap-4 border-l border-gray-100 pl-4 dark:border-gray-800">
          <Switch
            label="First-Order-Only Coupons"
            checked={draft.firstOrderCouponEnabled}
            disabled={!draft.managementEnabled}
            onChange={(checked) => set('firstOrderCouponEnabled', checked)}
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
