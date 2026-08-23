import { ACTOR_TYPES, SEO_AUDIT_ACTIONS, type Role } from '@medcommerce/shared';

import { env } from '../../config/env';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import { DEFAULT_SEO_CONFIG, SEO_DOMAIN_KEYS, validateSeoConfig, type SeoConfig } from './seo-config.util';

export { DEFAULT_SEO_CONFIG, validateSeoConfig, type SeoConfig };

/**
 * Part 16/17/36/46/49 — every SEO/AEO/GEO/search endpoint reads
 * its enablement/tunables from HERE, never hardcoded at the call site. Uses
 * the EXISTING Configuration engine (`seo` namespace), same as
 * analytics/coupon/notification configuration.
 */
export async function getSeoConfig(): Promise<SeoConfig> {
  const stored = (await getConfiguration('seo')) as Partial<SeoConfig>;
  return { ...DEFAULT_SEO_CONFIG, ...stored };
}

/** Part 2/49 — the single call every SEO route's gate middleware goes through. `domain` optional for a plain master-switch check. */
export async function isSeoDomainEnabled(domain?: keyof SeoConfig): Promise<boolean> {
  const config = await getSeoConfig();
  if (!config.seoEnabled) return false;
  if (!domain) return true;
  return config[domain] === true;
}

/** Part 19/20 — resolves the configured canonical base URL, falling back to `env.WEB_BASE_URL` (never a hardcoded production domain). */
export function resolveCanonicalBase(config: SeoConfig): string {
  return (config.canonicalBaseUrl || env.WEB_BASE_URL).replace(/\/$/, '');
}

/** Part 19/20 — resolves the default OG image to an absolute URL; a relative path (the default, `/logo.jpg`) is joined against the canonical base, an already-absolute admin-supplied URL is returned as-is. Never a local filesystem path. */
export function resolveOgImageUrl(config: SeoConfig): string {
  if (/^https?:\/\//i.test(config.defaultOgImage)) return config.defaultOgImage;
  const base = resolveCanonicalBase(config);
  return `${base}${config.defaultOgImage.startsWith('/') ? '' : '/'}${config.defaultOgImage}`;
}

/** Part 46/53 — the ONLY write path for SEO configuration. Merges a partial update onto the current persisted config, auto-cascades the master-off transition, validates, persists, and audits both the generic change and the master on/off transition specifically. */
export async function setSeoConfig(
  partial: Partial<SeoConfig>,
  actorId: string,
  actorRole?: Role,
): Promise<SeoConfig> {
  const current = await getSeoConfig();
  const next: SeoConfig = { ...current, ...partial };

  if (!next.seoEnabled) {
    for (const key of SEO_DOMAIN_KEYS) next[key] = false;
  }

  validateSeoConfig(next);

  await setConfiguration('seo', next, actorId);

  const actorType = actorRole ? actorTypeForRole(actorRole) : undefined;
  await recordAudit({
    actorId,
    actorType,
    action: SEO_AUDIT_ACTIONS.SEO_CONFIG_CHANGED,
    resource: 'seo_config',
    resourceId: null,
    before: current,
    after: next,
  });

  if (current.seoEnabled !== next.seoEnabled) {
    await recordAudit({
      actorId,
      actorType: actorType ?? ACTOR_TYPES.SYSTEM,
      action: next.seoEnabled ? SEO_AUDIT_ACTIONS.SEO_FEATURE_ENABLED : SEO_AUDIT_ACTIONS.SEO_FEATURE_DISABLED,
      resource: 'seo_config',
      resourceId: null,
    });
  }

  return next;
}
