import type { Request } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { redis } from '../config/redis';
import { asyncHandler } from '../utils/async-handler';

import {
  DEFAULT_RATE_LIMIT_CONFIG,
  getPolicyConfig,
  type RateLimitPolicyId,
} from './rate-limit-config.util';

function redisStore(prefix: string) {
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<unknown> as never,
    prefix,
  });
}

const actorOrIpKeyGenerator = (req: Request) =>
  (req as unknown as { user?: { id: string } }).user?.id ?? req.ip ?? 'anonymous';

interface ConfigurableLimiterOptions {
  redisPrefix: string;
  message: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Builds a rate limiter whose window/request-count come from the
 * Super-Admin-configurable `rateLimiting` Configuration namespace (see
 * rate-limit-config.util.ts / ConfigurationPage.tsx's dedicated Rate Limit
 * panel) instead of being hardcoded. `express-rate-limit`'s own `limit`
 * option supports being read per-request, but `windowMs` does not — so
 * changing the window requires rebuilding the whole limiter (and its
 * RedisStore) rather than just swapping a number. Rebuilding only happens
 * when the resolved config actually changes (cheap fingerprint check on
 * every request; the config read itself is Redis-cached — see
 * getPolicyConfig), so this stays as fast as a plain static limiter in the
 * steady state. Switching to a new window doesn't corrupt or reset counters
 * already recorded under the old window — Redis keys just expire on the TTL
 * they were written with.
 */
function createConfigurableLimiter(
  policyId: RateLimitPolicyId,
  options: ConfigurableLimiterOptions,
) {
  let cached: { middleware: RateLimitRequestHandler; fingerprint: string } | null = null;

  function build(windowMs: number, limit: number): RateLimitRequestHandler {
    return rateLimit({
      windowMs,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      store: redisStore(options.redisPrefix),
      keyGenerator: options.keyGenerator,
      message: {
        success: false,
        data: null,
        error: { code: 'RATE_LIMITED', message: options.message },
      },
    });
  }

  return asyncHandler(async (req, res, next) => {
    const policy = await getPolicyConfig(policyId).catch(() => DEFAULT_RATE_LIMIT_CONFIG[policyId]);
    const windowMs = policy.windowMinutes * 60 * 1000;
    const fingerprint = `${windowMs}:${policy.limit}`;

    if (!cached || cached.fingerprint !== fingerprint) {
      cached = { middleware: build(windowMs, policy.limit), fingerprint };
    }

    return cached.middleware(req, res, next);
  });
}

/** Baseline limiter applied to all `/api` traffic. Super-Admin configurable — "Public API (Global)" in the Rate Limit panel. */
export const globalRateLimiter = createConfigurableLimiter('publicApi', {
  redisPrefix: 'rl:global:',
  message: 'Too many requests, please try again later.',
});

/** Stricter limiter for auth endpoints (login/register/refresh/Google OAuth) to blunt credential-stuffing/brute force. Super-Admin configurable — "Login / Register / Refresh". */
export const authRateLimiter = createConfigurableLimiter('login', {
  redisPrefix: 'rl:auth:',
  message: 'Too many attempts, please try again later.',
});

/**
 * Prompt 24 Part 2 — a distinct, tighter category from `authRateLimiter`
 * for OTP verify/resend specifically (previously shared the same 20/15min
 * bucket as login/register/refresh, which the prompt's own "do not apply
 * one identical limit to every endpoint" instruction flags as too coarse).
 * `otp.service.ts` already enforces its OWN attempt-limit lockout and
 * resend cooldown internally (the actual brute-force defense for the OTP
 * VALUE itself); this is an outer, HTTP-level guard against raw request
 * flooding of those endpoints, tighter because a correct OTP guess needs
 * far fewer attempts than a password guess. Super-Admin configurable —
 * "OTP Request & Verification" (both `/login/verify-otp` and
 * `/login/resend-otp` share this one bucket, there is no split in the
 * underlying architecture).
 */
export const otpRateLimiter = createConfigurableLimiter('otp', {
  redisPrefix: 'rl:otp:',
  message: 'Too many OTP requests, please try again later.',
});

/**
 * Prompt 24 Part 2 — distinct category for the password-reset flow
 * (forgot-password / forgot-password-verify-otp / reset-password), separate
 * from ordinary login attempts: this flow can both enumerate accounts
 * (mitigated separately — see auth.service.ts's identical-response
 * behavior regardless of account existence) and, if successful, fully
 * take over an account — worth its own tighter, independently-tracked
 * bucket rather than sharing headroom with login attempts against a
 * DIFFERENT account. Super-Admin configurable — "Password Reset".
 */
export const passwordResetRateLimiter = createConfigurableLimiter('passwordReset', {
  redisPrefix: 'rl:password-reset:',
  message: 'Too many password reset attempts, please try again later.',
});

/**
 * Prompt 20 Part 33 — protects providers from a malicious/misbehaving
 * caller triggering unlimited manual sends via `POST /notifications/send`.
 * OTP's own request/resend cooldown+max-resend limits (otp.service.ts,
 * Prompt 10/34) already cover the OTP path independently — this is
 * specifically for the admin-triggered manual-send endpoint, keyed per
 * admin account (`req.user.id`) via `keyGenerator` rather than per-IP, since
 * this is an authenticated admin action, not a public one. Not part of the
 * Super-Admin-configurable policy set (narrow, internal, not in the
 * requested category list) — stays a static limiter.
 */
export const notificationSendRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:notif-send:'),
  keyGenerator: actorOrIpKeyGenerator,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMITED', message: 'Too many notification sends, please slow down.' },
  },
});

/**
 * Prompt 21 Part 40 — protects security-sensitive, authenticated self-service
 * customer actions from being hammered (account deactivation is a
 * password-guessing surface; address creation is a spam surface). Keyed per
 * authenticated user, same reasoning as notificationSendRateLimiter above.
 * Not part of the Super-Admin-configurable policy set — stays static.
 */
export const sensitiveAccountActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:account-action:'),
  keyGenerator: actorOrIpKeyGenerator,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later.' },
  },
});

/**
 * Prompt 23 Part 39 — search/suggestion endpoints are public and unauthenticated
 * (no `req.user` to key on), so this is per-IP like `globalRateLimiter` but
 * meaningfully stricter — a scraping/enumeration script hammering
 * `/search/autocomplete` with thousands of single-character queries is a
 * realistic abuse pattern the baseline global limiter (shared with every
 * other API call) wouldn't catch quickly enough on its own. Super-Admin
 * configurable — "Search".
 */
export const searchRateLimiter = createConfigurableLimiter('search', {
  redisPrefix: 'rl:search:',
  message: 'Too many search requests, please slow down.',
});

/**
 * Prompt 24 Part 2 — the webhook router (`/api/v1/webhooks/*`) is mounted
 * BEFORE `globalRateLimiter` (app.ts — it needs the raw request body ahead
 * of `express.json()`), so it previously had zero rate limiting of its
 * own. Signature/token verification (webhook.routes.ts) already rejects
 * anything unauthenticated, but an unbounded flood of even-rejected
 * requests is still a real DoS/cost surface (every request still pays for
 * TLS termination, routing, and a synchronous HMAC/timing-safe-compare
 * before being rejected). Generous limit — legitimate providers can burst
 * retries — but not unbounded. Per-IP: webhook callers are the payment/
 * shipping providers' servers, not end users, so there's no `req.user` to
 * key on. Not part of the Super-Admin-configurable policy set (an external
 * provider's own retry behavior, not a human-facing rate to tune) — stays
 * static.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:webhook:'),
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMITED', message: 'Too many webhook requests.' },
  },
});

/**
 * Prompt 24 Part 2 — bulk export/import (Excel product import, product/
 * coupon/report exports) are the heaviest per-request operations in this
 * API (full-collection scans, spreadsheet generation/parsing) and were
 * previously covered only by the shared `globalRateLimiter` (100/window,
 * identical to a cheap `GET /products/:id`). Keyed per-actor (these are
 * always authenticated admin actions), tighter window matching how
 * infrequently a legitimate admin actually re-exports/re-imports the same
 * dataset. Super-Admin configurable — "Export / Import".
 */
export const exportImportRateLimiter = createConfigurableLimiter('exportImport', {
  redisPrefix: 'rl:export-import:',
  message: 'Too many export/import requests, please slow down.',
  keyGenerator: actorOrIpKeyGenerator,
});

/**
 * Prompt 24 Part 2 — a broader-than-global, per-actor ceiling on the
 * `/admin/*` surface as a whole. This is layered ON TOP of (not instead
 * of) `globalRateLimiter` and every endpoint-specific limiter already
 * applied to individual admin routes — RBAC/authentication remain the
 * real authorization boundary; this exists purely to blunt a compromised
 * or malfunctioning admin session (or a stolen admin token) from being
 * used to hammer the entire admin API surface at the same volume a public
 * endpoint would tolerate. Super-Admin configurable — "Admin API".
 */
export const adminApiRateLimiter = createConfigurableLimiter('adminApi', {
  redisPrefix: 'rl:admin-api:',
  message: 'Too many admin API requests, please slow down.',
  keyGenerator: actorOrIpKeyGenerator,
});

/**
 * Prompt 32 Part 12 — the public Distributor/Bulk Purchase enquiry-create
 * endpoint writes to the database and enqueues admin/confirmation emails on
 * every hit, so it needs its own bound distinct from the generic
 * `globalRateLimiter` (a cheap `GET /products` tolerates far more traffic
 * than a write-plus-notification endpoint should). Per-IP: this is public
 * and often unauthenticated (guest distributors), so there's no `req.user`
 * to key on. OTP request/verify on this same feature reuse the existing
 * `otpRateLimiter` — no second OTP-specific limiter needed. Not part of the
 * Super-Admin-configurable policy set — stays static.
 */
export const distributorEnquiryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:distributor-enquiry:'),
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMITED', message: 'Too many enquiry submissions, please try again later.' },
  },
});
