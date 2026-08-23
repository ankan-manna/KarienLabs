import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getFulfillmentConfig, setFulfillmentConfig, type FulfillmentConfig } from '../../../api/orders.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

/**
 * Part 30/31/32/39 — Super Admin / permitted Platform Admin
 * configuration for the automated post-payment fulfillment sweep (payment
 * captured -> order advanced -> invoice -> Shiprocket -> label, all
 * unchanged pipeline steps from s 2/13/14 — this page only controls
 * WHETHER and HOW OFTEN the automation that triggers them runs). Its own
 * dedicated page (not the raw generic ConfigurationPage) for the same
 * reason Medical Compliance/Coupon/Notification Settings are — writes go
 * through the validated `/orders/fulfillment-config` endpoint (whitelist +
 * range checks, order.validator.ts), never the unvalidated generic
 * `PUT /configuration/:namespace`.
 */
export default function FulfillmentAutomationPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FulfillmentConfig | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fulfillment-config'],
    queryFn: getFulfillmentConfig,
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<FulfillmentConfig>) => setFulfillmentConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['fulfillment-config'] });
      toast.success('Fulfillment automation configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;

  function set<K extends keyof FulfillmentConfig>(key: K, value: FulfillmentConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const dependentsDisabled = !draft.automationEnabled;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Fulfillment Automation</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls the background sweep that automatically advances paid orders through invoice
        generation, Shiprocket order creation, and label generation — the same pipeline an admin could
        already trigger manually, just no longer requiring a human to click through every order.
        Disabling automation here stops NEW work from being enqueued; already-queued or in-flight jobs
        still finish, and the manual admin actions (order status update, shipment retry, invoice
        regenerate) keep working exactly as before regardless of this setting.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="Automated Fulfillment"
          checked={draft.automationEnabled}
          onChange={(checked) => set('automationEnabled', checked)}
        />

        <div className="ml-4 flex flex-col gap-4 border-l border-gray-100 pl-4 dark:border-gray-800">
          <Switch
            label="Order Advancement (payment confirmed -> ready for invoice)"
            checked={draft.orderAdvancementEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('orderAdvancementEnabled', checked)}
          />
          <Switch
            label="Shiprocket Order Creation"
            checked={draft.shippingAutomationEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('shippingAutomationEnabled', checked)}
          />
          <Switch
            label="Shipping Label Generation"
            checked={draft.labelAutomationEnabled}
            disabled={dependentsDisabled}
            onChange={(checked) => set('labelAutomationEnabled', checked)}
          />
          <Input
            label="Sweep Interval (hours)"
            type="number"
            value={String(draft.cronIntervalHours)}
            disabled={dependentsDisabled}
            onChange={(e) => set('cronIntervalHours', Number(e.target.value))}
          />
          <Input
            label="Tolerance Window (minutes, before/after the interval)"
            type="number"
            value={String(draft.toleranceMinutes)}
            disabled={dependentsDisabled}
            onChange={(e) => set('toleranceMinutes', Number(e.target.value))}
          />
          <Input
            label="Batch Size (orders discovered per sweep page)"
            type="number"
            value={String(draft.batchSize)}
            disabled={dependentsDisabled}
            onChange={(e) => set('batchSize', Number(e.target.value))}
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
