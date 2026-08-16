import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getAnalyticsConfig, setAnalyticsConfig, type AnalyticsConfig } from '../../../api/admin-reports.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

const DOMAIN_TOGGLES: { key: keyof AnalyticsConfig; label: string; description?: string }[] = [
  { key: 'salesAnalyticsEnabled', label: 'Sales & Revenue' },
  { key: 'orderAnalyticsEnabled', label: 'Orders' },
  { key: 'customerAnalyticsEnabled', label: 'Customers' },
  { key: 'productAnalyticsEnabled', label: 'Products' },
  { key: 'categoryAnalyticsEnabled', label: 'Categories' },
  { key: 'inventoryAnalyticsEnabled', label: 'Inventory & Warehouses' },
  { key: 'paymentAnalyticsEnabled', label: 'Payments' },
  { key: 'shippingAnalyticsEnabled', label: 'Shipping & Delivery' },
  { key: 'returnAnalyticsEnabled', label: 'Returns & Replacements' },
  { key: 'refundAnalyticsEnabled', label: 'Refunds' },
  { key: 'prescriptionAnalyticsEnabled', label: 'Prescriptions' },
  { key: 'couponAnalyticsEnabled', label: 'Coupons' },
  { key: 'taxAnalyticsEnabled', label: 'GST / Tax' },
  {
    key: 'distributorAnalyticsEnabled',
    label: 'Distributor / Bulk Purchase Enquiries',
    description: 'Enquiry counts, status breakdown, and top requested SKUs on the Analytics page.',
  },
  {
    key: 'googleAnalyticsEnabled',
    label: 'Google Analytics (website behavior tracking)',
    description:
      'Loads GA4 on the storefront when a Measurement ID is configured (VITE_GA_MEASUREMENT_ID). Tracks website/user behavior only — never the source of truth for revenue/order reports.',
  },
  {
    key: 'platformHealthAnalyticsEnabled',
    label: 'Platform Health (Super Admin ops panel)',
    description:
      'Exposes DB/queue status, memory, and security-alert counts — defaults OFF; opt a Platform Admin in deliberately.',
  },
];

/**
 * Prompt 22 Part 2/3/38/46 — the dedicated Super Admin / permitted Platform
 * Admin "Analytics Settings" configuration page, same pattern as
 * CouponSettingsPage/NotificationSettingsPage: its own page (not a namespace
 * on the generic ConfigurationPage) because writes must go through the
 * validated `/admin/reports/config` endpoint, which cascades the master
 * switch and rejects an inconsistent combination server-side.
 */
export default function AnalyticsSettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AnalyticsConfig | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['analytics-config'], queryFn: getAnalyticsConfig });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<AnalyticsConfig>) => setAnalyticsConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['analytics-config'] });
      toast.success('Analytics configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-96 w-full" />;

  function set<K extends keyof AnalyticsConfig>(key: K, value: AnalyticsConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Analytics Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls which admin analytics/report domains are available platform-wide. Disabling a
        domain rejects that report/analytics endpoint for every Platform Admin, backend-enforced
        (Super Admin always retains access to reach this page and turn it back on). Turning off
        Analytics entirely also disables every domain below it.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="Analytics (master switch)"
          checked={draft.analyticsEnabled}
          onChange={(checked) => set('analyticsEnabled', checked)}
        />
        <div className="ml-4 grid grid-cols-1 gap-3 border-l border-gray-100 pl-4 dark:border-gray-800 sm:grid-cols-2">
          {DOMAIN_TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex flex-col gap-1">
              <Switch
                label={toggle.label}
                checked={draft[toggle.key]}
                disabled={!draft.analyticsEnabled}
                onChange={(checked) => set(toggle.key, checked)}
              />
              {toggle.description ? (
                <p className="ml-11 text-xs text-gray-400 dark:text-gray-500">{toggle.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
        Save configuration
      </Button>
    </div>
  );
}
