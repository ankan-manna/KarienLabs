import { redis } from '../config/redis';
import { ConfigurationModel } from '../modules/platform/models/configuration.model';

/**
 * The rate-limit policies actually enforced by distinct, pre-existing
 * Redis-backed limiters in rate-limit.middleware.ts — this list is
 * deliberately NOT a wishlist of every conceivable category; each entry here
 * corresponds to a real `rateLimit()` instance already mounted on real
 * routes. Two categories from the original request are intentionally
 * NOT modeled as separate policies, because the underlying architecture
 * doesn't actually distinguish them:
 *   - "OTP Request" vs "OTP Verification" — both `/login/verify-otp` and
 *     `/login/resend-otp` share the ONE `otpRateLimiter` bucket today.
 *   - "Admin Login" vs "Login" — admin and customer accounts authenticate
 *     through the exact same `POST /auth/login` route/limiter; there is no
 *     route-level signal to split on before the account (and therefore its
 *     role) has even been looked up.
 * Splitting either pair would mean adding new limiter instances on new
 * route wiring, not "making an existing policy configurable" — out of
 * scope here, and called out explicitly in the admin UI/docs instead of
 * silently faked.
 */
export const RATE_LIMIT_POLICIES = [
  { id: 'login', label: 'Login / Register / Refresh', redisPrefix: 'rl:auth:' },
  { id: 'otp', label: 'OTP Request & Verification', redisPrefix: 'rl:otp:' },
  { id: 'passwordReset', label: 'Password Reset', redisPrefix: 'rl:password-reset:' },
  { id: 'search', label: 'Search', redisPrefix: 'rl:search:' },
  { id: 'exportImport', label: 'Export / Import', redisPrefix: 'rl:export-import:' },
  { id: 'adminApi', label: 'Admin API', redisPrefix: 'rl:admin-api:' },
  { id: 'publicApi', label: 'Public API (Global)', redisPrefix: 'rl:global:' },
] as const;

export type RateLimitPolicyId = (typeof RATE_LIMIT_POLICIES)[number]['id'];

export interface PolicyConfig {
  windowMinutes: number;
  limit: number;
}

export type RateLimitConfigMap = Record<RateLimitPolicyId, PolicyConfig>;

/** Only these window sizes are selectable — matches the admin UI's dropdown exactly, so a value that could never have come from that UI can't sneak in via a direct API call either. */
export const ALLOWED_WINDOW_MINUTES = [1, 10, 20, 30, 40, 50, 60] as const;

/**
 * "As of now" default for Login per the Super Admin's request (was
 * hardcoded 20/15min). Every other policy keeps its own pre-existing
 * hardcoded request count as its new configurable starting point; windows
 * that weren't already one of ALLOWED_WINDOW_MINUTES (otp/passwordReset/
 * exportImport were all hardcoded to a 15-minute window, which isn't one of
 * the admin UI's dropdown options) are rounded to the nearest allowed
 * option (10 min) so the picker always shows a real, selected value instead
 * of a default that could never have come from that same dropdown.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfigMap = {
  login: { windowMinutes: 10, limit: 100 },
  otp: { windowMinutes: 10, limit: 10 },
  passwordReset: { windowMinutes: 10, limit: 10 },
  search: { windowMinutes: 1, limit: 60 },
  exportImport: { windowMinutes: 10, limit: 20 },
  adminApi: { windowMinutes: 1, limit: 300 },
  publicApi: { windowMinutes: 1, limit: 100 },
};

const CACHE_KEY = 'config:rateLimiting:policies';
const CACHE_TTL_SECONDS = 30;

/**
 * Request-count validation (Part 13 of the spec this implements): a
 * positive integer, no zero, no decimals, no negative, capped at a sane
 * ceiling so a fat-fingered "0" or "99999999" can't accidentally lock every
 * user out or effectively disable a policy.
 */
export function isValidRequestCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100_000;
}

export function isValidWindowMinutes(value: unknown): value is number {
  return (ALLOWED_WINDOW_MINUTES as readonly number[]).includes(value as number);
}

function clampPolicy(raw: unknown, fallback: PolicyConfig): PolicyConfig {
  const candidate = raw as Partial<PolicyConfig> | undefined;
  return {
    windowMinutes: isValidWindowMinutes(candidate?.windowMinutes)
      ? (candidate!.windowMinutes as number)
      : fallback.windowMinutes,
    limit: isValidRequestCount(candidate?.limit) ? (candidate!.limit as number) : fallback.limit,
  };
}

/**
 * Reads the `rateLimiting` Configuration namespace directly against
 * ConfigurationModel — deliberately NOT via configuration.service.ts's
 * getConfiguration() — to avoid a circular import: configuration.service.ts
 * needs to call invalidateRateLimitConfigCache() below on every config
 * write, so this module can't depend back on it. Mirrors the exact same
 * shape/reasoning as maintenance-mode.middleware.ts's readMaintenanceConfig.
 */
export async function getRateLimitConfig(): Promise<RateLimitConfigMap> {
  const cached = await redis.get(CACHE_KEY);
  if (cached !== null) return JSON.parse(cached) as RateLimitConfigMap;

  const config = await ConfigurationModel.findOne({ namespace: 'rateLimiting' }).lean();
  const raw = (config?.value as Partial<Record<RateLimitPolicyId, unknown>>) ?? {};

  const value = Object.fromEntries(
    RATE_LIMIT_POLICIES.map(({ id }) => [id, clampPolicy(raw[id], DEFAULT_RATE_LIMIT_CONFIG[id])]),
  ) as RateLimitConfigMap;

  await redis.set(CACHE_KEY, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  return value;
}

export async function getPolicyConfig(id: RateLimitPolicyId): Promise<PolicyConfig> {
  const all = await getRateLimitConfig();
  return all[id];
}

/** Call after any write to the `rateLimiting` Configuration namespace — see configuration.service.ts. */
export async function invalidateRateLimitConfigCache(): Promise<void> {
  await redis.del(CACHE_KEY);
}
