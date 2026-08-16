import { ACTOR_TYPES, ANALYTICS_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import {
  ANALYTICS_DOMAIN_KEYS,
  DEFAULT_ANALYTICS_CONFIG,
  validateAnalyticsConfig,
  type AnalyticsConfig,
} from './analytics-config.util';

export { DEFAULT_ANALYTICS_CONFIG, validateAnalyticsConfig, type AnalyticsConfig };

/**
 * Prompt 22 Part 2/3/38/46 — every analytics/report/dashboard endpoint reads
 * its enablement from HERE, never hardcoded at the call site. Uses the
 * EXISTING Configuration engine (`analytics` namespace), same as
 * coupon/notification/prescription configuration.
 */
export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  const stored = (await getConfiguration('analytics')) as Partial<AnalyticsConfig>;
  return { ...DEFAULT_ANALYTICS_CONFIG, ...stored };
}

/** Part 2 — the single call every analytics route's gate middleware goes through. `domain` is optional so a plain master-switch check is also possible. */
export async function isAnalyticsDomainEnabled(domain?: keyof AnalyticsConfig): Promise<boolean> {
  const config = await getAnalyticsConfig();
  if (!config.analyticsEnabled) return false;
  if (!domain) return true;
  return config[domain] === true;
}

/**
 * Prompt 34 Part 13/14/19 — narrow, anonymous-readable subset of this
 * namespace for the storefront's GA4 loader to consult before it ever
 * calls gtag. Deliberately mirrors the `getPublicAuthConfig`/
 * `getPublicDistributorEnquiryConfig` pattern (a purpose-built endpoint
 * returning only the fields a public client legitimately needs) rather
 * than `public-cms.routes.ts`'s `/site-settings`-style raw-namespace dump —
 * every other key in `AnalyticsConfig` gates internal business-reporting
 * endpoints and has no reason to be visible to an unauthenticated caller.
 */
export async function getPublicAnalyticsConfig(): Promise<{ googleAnalyticsEnabled: boolean }> {
  const config = await getAnalyticsConfig();
  return { googleAnalyticsEnabled: config.analyticsEnabled && config.googleAnalyticsEnabled };
}

/** Part 46/53 — the ONLY write path for analytics configuration. Merges a partial update onto the current persisted config, validates, persists, and audits both the generic change and the master on/off transition specifically. */
export async function setAnalyticsConfig(
  partial: Partial<AnalyticsConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<AnalyticsConfig> {
  const current = await getAnalyticsConfig();
  const next: AnalyticsConfig = { ...current, ...partial };

  // A caller flipping the master switch off shouldn't also have to
  // enumerate all N domain toggles as false — that's exactly the "unknown
  // internal detail leaking into the API contract" trap. Auto-cascade here
  // (write-path concern) rather than in validateAnalyticsConfig (whose job
  // is just to check a GIVEN state is internally consistent, reused as-is
  // by the pure unit tests).
  if (!next.analyticsEnabled) {
    for (const key of ANALYTICS_DOMAIN_KEYS) next[key] = false;
  }

  validateAnalyticsConfig(next);

  await setConfiguration('analytics', next, actorId);

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  await recordAudit({
    actorId,
    actorType,
    action: ANALYTICS_AUDIT_ACTIONS.ANALYTICS_CONFIG_CHANGED,
    resource: 'analytics_config',
    resourceId: null,
    before: current,
    after: next,
  });

  if (current.analyticsEnabled !== next.analyticsEnabled) {
    await recordAudit({
      actorId,
      actorType: actorType ?? ACTOR_TYPES.SYSTEM,
      action: next.analyticsEnabled
        ? ANALYTICS_AUDIT_ACTIONS.ANALYTICS_FEATURE_ENABLED
        : ANALYTICS_AUDIT_ACTIONS.ANALYTICS_FEATURE_DISABLED,
      resource: 'analytics_config',
      resourceId: null,
    });
  }

  return next;
}
