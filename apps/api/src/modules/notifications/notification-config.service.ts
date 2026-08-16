import { ACTOR_TYPES, NOTIFICATION_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import {
  DEFAULT_NOTIFICATION_CONFIG,
  validateNotificationConfig,
  type NotificationConfig,
} from './notification-config.util';

export { DEFAULT_NOTIFICATION_CONFIG, validateNotificationConfig, type NotificationConfig };

/** Prompt 20 Part 14/47 — every notification enable/disable decision reads from HERE. Uses the EXISTING Configuration engine (`notification` namespace) — not a second settings store. */
export async function getNotificationConfig(): Promise<NotificationConfig> {
  const stored = (await getConfiguration('notification')) as Partial<NotificationConfig>;
  return { ...DEFAULT_NOTIFICATION_CONFIG, ...stored };
}

/** Part 15/53 — the ONLY write path. Merges a partial update onto the current config, validates, persists, and audits (including the on/off transition specifically). */
export async function setNotificationConfig(
  partial: Partial<NotificationConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<NotificationConfig> {
  const current = await getNotificationConfig();
  const next: NotificationConfig = { ...current, ...partial };
  validateNotificationConfig(next);

  await setConfiguration('notification', next, actorId);

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  await recordAudit({
    actorId,
    actorType,
    action: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_CONFIG_CHANGED,
    resource: 'notification_config',
    resourceId: null,
    before: current,
    after: next,
  });

  if (current.notificationsEnabled !== next.notificationsEnabled) {
    await recordAudit({
      actorId,
      actorType: actorType ?? ACTOR_TYPES.SYSTEM,
      action: next.notificationsEnabled
        ? NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_FEATURE_ENABLED
        : NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_FEATURE_DISABLED,
      resource: 'notification_config',
      resourceId: null,
    });
  }

  return next;
}
