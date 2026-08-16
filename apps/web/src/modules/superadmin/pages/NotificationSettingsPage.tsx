import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  getNotificationConfig,
  getProviderHealth,
  setNotificationConfig,
  type NotificationConfig,
} from '../../../api/notifications-admin.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

/**
 * Prompt 20 Part 9/15/31/53 — the dedicated Super Admin / permitted
 * Platform Admin "Notification Settings" page, same reasoning as Coupon
 * Settings / Medical Compliance: writes must go through the validated
 * `/notifications/config` endpoint, not the generic unvalidated
 * `PUT /configuration/:namespace`.
 */
export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<NotificationConfig | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['notification-config'], queryFn: getNotificationConfig });
  const { data: health } = useQuery({ queryKey: ['notification-provider-health'], queryFn: getProviderHealth });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<NotificationConfig>) => setNotificationConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['notification-config'] });
      toast.success('Notification configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;

  function set<K extends keyof NotificationConfig>(key: K, value: NotificationConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const categoryDisabled = !draft.notificationsEnabled;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Notification Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls the notification system platform-wide. Login/password-reset OTP delivery is never
        affected by the master switch or category toggles below (only a channel being off can block
        it) — disabling notifications can never lock customers out of their account.
      </p>

      {health && (
        <Card className="flex flex-wrap gap-4 p-4 text-sm">
          {(['email', 'sms', 'whatsapp', 'push'] as const).map((channel) => (
            <div key={channel} className="flex items-center gap-2">
              <span className="capitalize text-gray-600 dark:text-gray-300">{channel}</span>
              <Badge tone={health[channel].configured ? 'green' : 'gray'}>{health[channel].status}</Badge>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="Notifications"
          checked={draft.notificationsEnabled}
          onChange={(checked) => set('notificationsEnabled', checked)}
        />
        <div className="ml-4 flex flex-col gap-4 border-l border-gray-100 pl-4 dark:border-gray-800">
          <p className="text-xs font-medium uppercase text-gray-400">Channels</p>
          <Switch label="Email" checked={draft.emailEnabled} onChange={(checked) => set('emailEnabled', checked)} />
          <Switch label="SMS" checked={draft.smsEnabled} onChange={(checked) => set('smsEnabled', checked)} />
          <Switch
            label="WhatsApp"
            checked={draft.whatsappEnabled}
            onChange={(checked) => set('whatsappEnabled', checked)}
          />
          <Switch label="Push" checked={draft.pushEnabled} onChange={(checked) => set('pushEnabled', checked)} />

          <p className="mt-2 text-xs font-medium uppercase text-gray-400">Categories</p>
          <Switch
            label="Order Notifications"
            checked={draft.orderNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('orderNotificationsEnabled', checked)}
          />
          <Switch
            label="Payment Notifications"
            checked={draft.paymentNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('paymentNotificationsEnabled', checked)}
          />
          <Switch
            label="Shipping Notifications"
            checked={draft.shippingNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('shippingNotificationsEnabled', checked)}
          />
          <Switch
            label="Return Notifications"
            checked={draft.returnNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('returnNotificationsEnabled', checked)}
          />
          <Switch
            label="Prescription Notifications"
            checked={draft.prescriptionNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('prescriptionNotificationsEnabled', checked)}
          />
          <Switch
            label="Admin Notifications"
            checked={draft.adminNotificationsEnabled}
            disabled={categoryDisabled}
            onChange={(checked) => set('adminNotificationsEnabled', checked)}
          />
        </div>
      </Card>

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
        Save configuration
      </Button>
    </div>
  );
}
