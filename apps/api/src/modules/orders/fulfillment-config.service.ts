import { type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import {
  DEFAULT_FULFILLMENT_CONFIG,
  validateFulfillmentConfig,
  type FulfillmentConfig,
} from './fulfillment-config.util';

export { DEFAULT_FULFILLMENT_CONFIG, validateFulfillmentConfig, type FulfillmentConfig };

/**
 * Prompt 27 — every automated-fulfillment business behavior is read from
 * HERE, never hardcoded at the call site. Uses the EXISTING Configuration
 * engine (`fulfillment` namespace) — not a second settings store, reachable
 * through the already-generic `GET/PUT /configuration/:namespace` admin API
 * (configuration.routes.ts) exactly like every namespace that doesn't need
 * bespoke cross-field validation beyond a plain whitelist+range check.
 */
export async function getFulfillmentConfig(): Promise<FulfillmentConfig> {
  const stored = (await getConfiguration('fulfillment')) as Partial<FulfillmentConfig>;
  return { ...DEFAULT_FULFILLMENT_CONFIG, ...stored };
}

/** Part 30/31 — the single call every automation entry point (sweep, per-order job, label step) goes through to know if it's even allowed to act. */
export async function isFulfillmentAutomationEnabled(): Promise<boolean> {
  return (await getFulfillmentConfig()).automationEnabled;
}

export async function setFulfillmentConfig(
  partial: Partial<FulfillmentConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<FulfillmentConfig> {
  const current = await getFulfillmentConfig();
  const next: FulfillmentConfig = { ...current, ...partial };
  validateFulfillmentConfig(next);

  await setConfiguration('fulfillment', next, actorId);

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: 'config_change',
    resource: 'fulfillment_config',
    resourceId: null,
    before: current,
    after: next,
  });

  return next;
}
