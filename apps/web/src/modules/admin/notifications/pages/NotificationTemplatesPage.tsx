import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  notificationTemplateApi,
  previewTemplate,
  type NotificationTemplate,
} from '../../../../api/notifications-admin.api';
import { Button } from '../../../../components/common/Button';
import { Skeleton } from '../../../../components/common/Skeleton';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { toast } from '../../../../utils/toast';
import { notificationTemplateHooks } from '../hooks/useNotifications';

const fields: ConfigField[] = [
  { name: 'key', label: 'Key', type: 'text' },
  {
    name: 'channel',
    label: 'Channel',
    type: 'select',
    options: [
      { label: 'Email', value: 'email' },
      { label: 'SMS', value: 'sms' },
      { label: 'WhatsApp', value: 'whatsapp' },
      { label: 'Push', value: 'push' },
    ],
    defaultValue: 'email',
  },
  { name: 'subject', label: 'Subject', type: 'text', required: false },
  { name: 'body', label: 'Body (Handlebars template)', type: 'textarea', showInTable: false },
];

/**
 * Notification Templates' "Preview" drawer tab — renders the template with safe
 * generic mock data via `POST /notifications/templates/:id/preview`. The response
 * body is HTML (the rendered template), so it's shown in a fully sandboxed iframe
 * (no scripts, no same-origin) rather than injected into the page — never real
 * customer/order data flows through this endpoint, but the HTML itself is untrusted.
 */
function NotificationTemplatePreview({ template }: { template: NotificationTemplate }) {
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const mutation = useMutation({
    mutationFn: () => previewTemplate(template._id),
    onSuccess: setResult,
    onError: (error: Error) => toast.error(error.message || 'Failed to render preview'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Renders this template with safe, generic mock data — never real customer or order data.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
          {result ? 'Refresh Preview' : 'Preview'}
        </Button>
      </div>

      {mutation.isPending && <Skeleton className="h-64 w-full" />}

      {result && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Subject</div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-sm dark:border-gray-800 dark:bg-gray-800/50">
              {result.subject || <span className="text-gray-400">(no subject)</span>}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Body</div>
            <iframe
              title="Rendered template body"
              srcDoc={result.body}
              sandbox=""
              className="h-96 w-full rounded-md border border-gray-200 bg-white dark:border-gray-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificationTemplatesPage() {
  return (
    <ConfigEntityPage<NotificationTemplate>
      title="Notification Templates"
      resource="notifications"
      hooks={notificationTemplateHooks}
      fields={fields}
      api={notificationTemplateApi}
      renderPreview={(template) => <NotificationTemplatePreview template={template} />}
    />
  );
}
