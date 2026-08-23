import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../../api/notifications-admin.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { formatDateTime } from '../../../utils/format';

const CHANNEL_ICON: Record<string, string> = { email: '✉️', sms: '💬', whatsapp: '📱', push: '🔔' };

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow'> = {
  sent: 'green',
  queued: 'yellow',
  failed: 'red',
  cancelled: 'gray',
};

/** Part 53/54 — the in-app notification center: read/unread state, mark-as-read on click, mark-all-read. */
export default function MyNotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', 'mine'],
    queryFn: () => listMyNotifications({ limit: 50 }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] }),
  });

  const unreadCount = notifications?.items.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Notifications
          {unreadCount > 0 && <span className="ml-2 text-sm font-normal text-brand-600">({unreadCount} unread)</span>}
        </h1>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            isLoading={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} columns={1} />
      ) : !notifications || notifications.items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Order updates, delivery status, and offers will appear here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.items.map((n) => (
            <div
              key={n._id}
              onClick={() => {
                if (!n.isRead) markReadMutation.mutate(n._id);
              }}
            >
              <Card
                className={`flex cursor-pointer items-center gap-3 p-3 ${n.isRead ? '' : 'border-brand-300 bg-brand-50 dark:bg-brand-950/10'}`}
              >
                <span className="text-lg">{CHANNEL_ICON[n.channel] ?? '🔔'}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {n.templateKey.replace(/_/g, ' ')}
                    {!n.isRead && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand-500" />}
                  </p>
                  <p className="text-xs text-gray-400">{formatDateTime(n.sentAt)}</p>
                </div>
                <Badge tone={STATUS_TONE[n.status] ?? 'gray'}>{n.status}</Badge>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
