# MedCommerce Security Architecture

_Last updated: Prompt 24 (Security Hardening & Production Readiness). This
document describes what exists today, not aspirational future work — every
claim below is backed by real, live-verified code in this repository._

## 1. Request flow

```
Client
  ↓
Nginx (HTTPS termination, edge rate limiting, security headers)
  ↓
Express security middleware: requestId → pino request logging →
  helmet (CSP/headers) → CORS → compression → mongo-sanitize →
  metrics → [webhooks: raw-body signature verification, own rate limiter] →
  express.json (2MB limit) → hpp → cookie-parser →
  /health, /health/live, /health/ready → global rate limiter →
  blocked-IP gate → maintenance-mode gate → /admin/* rate limiter
  ↓
Authentication (JWT bearer, HS256, 15m access + rotating refresh tokens)
  ↓
Actor context (requestId/actorId/actorType/role propagated via AsyncLocalStorage)
  ↓
RBAC/PBAC (role permission cache + per-user grant/deny overrides, super_admin bypass)
  ↓
Configuration (per-domain enable/disable, Super-Admin-controlled)
  ↓
Controller → Service (business logic, ALWAYS the source of truth for
  price/total/stock/availability — never trusts a client-supplied value)
  ↓
MongoDB / Cloudinary / S3 / Razorpay / Shiprocket / SMTP
  ↓
Audit (AuditService) + structured production logging (redacted)
  ↓
Monitoring (Prometheus metrics, platform-health panel)
```

## 2. Authentication

- **Password hashing**: bcrypt, cost factor 12. `passwordHash` has
  `select: false` on the User schema; never returned in any API response,
  audit record, or log line.
- **Access tokens**: JWT, HS256 (explicitly pinned via `algorithms: ['HS256']`
  on every `jwt.verify` call, not left to jsonwebtoken's defaults),
  15-minute TTL, signed with `JWT_ACCESS_SECRET` (required, ≥32 chars,
  validated at boot).
- **Refresh tokens**: NOT JWTs. Random 32-byte tokens, stored as a SHA-256
  hash only (never the raw token), with rotation-on-use and a `familyId`
  reuse-detection chain — presenting an already-rotated (stolen, replayed)
  refresh token revokes the entire token family immediately.
- **OTP**: `crypto.randomInt` generation (CSPRNG), configurable expiry,
  attempt-limit lockout, resend cooldown + max-resend cap, single-use
  (consumed on verify), compared via SHA-256 + `timingSafeEqual` (never
  `===`). The OTP value itself is never logged or returned in any
  response outside local development.
- **Google OAuth**: server-side ID-token verification via
  `google-auth-library`'s `OAuth2Client.verifyIdToken` (audience/issuer/
  signature/expiry all checked); never trusts a client-supplied profile
  object. CSRF `state` uses a double-submit cookie. Never auto-provisions
  or elevates an account's role.
- **Account enumeration**: login, forgot-password, and OTP-verify all
  return the identical generic failure ("Invalid email or password" /
  `{requested: true}`) whether or not the account exists.

## 3. Authorization (RBAC/PBAC) and Super Admin protection

Roles are documents (`RoleModel`) with a `permissions: string[]` array of
`resource:action` pairs, cached in Redis (60s TTL). Per-user grant/deny
overrides (`UserPermissionModel`) layer on top, deny always wins.
`super_admin` bypasses granular checks entirely.

**Prompt 24 finding and fix**: route-level `authorize()` proves an actor
holds *some* permission on a resource (e.g. `users:update`); it does not by
itself distinguish "can manage an ordinary admin" from "can manage/create/
demote a Super Admin." A second, service-layer guard was added
(`admin-user.service.ts`, `role.service.ts`, `user-permission.service.ts`)
that independently enforces:

- Only a `super_admin` actor may create, promote-to, suspend, or
  reset-password on a `super_admin`-role account.
- No actor may change their own admin role/status through the admin
  management endpoint (self-escalation and accidental self-lockout both
  closed by the same rule).
- Only a `super_admin` may edit the `super_admin` role's own permission set.
- No actor may grant or revoke a permission override on `roles`, `users`,
  `configuration`, or `audit_logs` for anyone unless they are themselves a
  `super_admin`; no actor may grant/revoke a permission override on
  **themselves** at all.
- Every permission grant/revoke is now audited (previously it was not).

Regression-tested end-to-end in
`apps/api/src/integration-tests/rbac-privilege-escalation.integration.test.ts`
(13 scenarios: every escalation path blocked, every legitimate Super Admin
action still works).

Role/permission/`userId`/`adminId` are **never** read from `req.body`
anywhere in this codebase — always derived from the authenticated
`req.user` (JWT-verified actor context).

**Admin session security (Part 63, follow-up finding)**: `requireAuth`
previously trusted a JWT's embedded `{ sub, role }` for the token's full
15-minute life with no re-check of the account's CURRENT active/suspended
state — a just-suspended or self-deactivated account could keep using an
already-issued access token until it naturally expired, even though its
refresh tokens were correctly revoked immediately. Fixed with a
Redis-cached (60s TTL, same pattern as the permission caches above,
independently resilient to a Redis outage — falls back to a direct
MongoDB read rather than failing every authenticated request) account-status
check inside `requireAuth`, invalidated on every suspend/unsuspend/
role-change/self-deactivate write. Regression-tested in
`apps/api/src/integration-tests/admin-session-security.integration.test.ts`
(4 scenarios, including "the exact same still-valid JWT is rejected within
one request of being suspended, and restored within one request of being
unsuspended").

## 4. Rate limiting

All limiters are Redis-backed (`rate-limit-redis`), so they are correct
across multiple Node.js instances (the deployment's actual topology — see
`infra/docker/docker-compose*.yml`), not in-memory per-process counters
that would under-count/be bypassable behind a load balancer.

| Limiter | Window / Limit | Key | Applied to |
|---|---|---|---|
| `globalRateLimiter` | configurable (env), default 60s/100 | IP | all of `/api/v1` |
| `authRateLimiter` | 15min/20 | IP | login, register, refresh, Google login |
| `otpRateLimiter` (Prompt 24, split out) | 15min/10 | IP/actor | login OTP verify/resend, profile phone-change OTP |
| `passwordResetRateLimiter` (Prompt 24, split out) | 15min/10 | IP | forgot-password, forgot-password OTP verify, reset-password |
| `searchRateLimiter` | 60s/60 | IP | `/search/*` |
| `notificationSendRateLimiter` | 60s/20 | actor | manual notification send |
| `sensitiveAccountActionRateLimiter` | 15min/10 | actor | account deactivation, address writes |
| `webhookRateLimiter` (Prompt 24) | 60s/120 | IP | `/api/v1/webhooks/*` — previously **unlimited** |
| `exportImportRateLimiter` (Prompt 24) | 15min/20 | actor | bulk Excel import/export, product/category/... export |
| `adminApiRateLimiter` (Prompt 24) | 60s/300 | actor | the entire `/admin/*` surface, layered on top of the above |

`authRateLimiter`/`otpRateLimiter`/`passwordResetRateLimiter` were originally
one shared 20/15min bucket covering login, OTP, and password-reset alike —
split into three independently-tracked, appropriately-sized categories per
this prompt's own "do not apply one identical limit to every endpoint"
instruction; OTP/password-reset endpoints also have their OWN internal
attempt-limit/cooldown logic in `otp.service.ts` regardless of this
HTTP-level limiter, which is the actual brute-force defense for the code
value itself — this limiter is the outer request-flooding guard.

`app.set('trust proxy', 1)` trusts exactly one hop — matching the Nginx
topology in `infra/nginx/`. `X-Forwarded-For`/`X-Real-IP` are only honored
because Nginx (the sole trusted hop) sets them correctly; a client cannot
spoof its way past rate limiting by sending its own `X-Forwarded-For`
directly to the API (only reachable through Nginx in production).

**Concurrency/load-tested (Part 73)** against the same ephemeral
mongodb-memory-server + redis-test-server harness every integration test in
this repo uses (never the shared dev database) — 100 genuinely concurrent
(`Promise.allSettled`, not sequential) requests complete without a crash or
hang; 150 concurrent requests correctly produce a mix of `200`/`429`
(proving the limiter engages under burst, never silently drops or crashes);
concurrent requests from two different IPs are tracked independently (no
cross-client bucket bleed). See
`apps/api/src/integration-tests/concurrency-load.integration.test.ts`. This
is NOT a substitute for the real 500–2,000-concurrent-user infrastructure
load test the master prompt series explicitly defers to a later prompt —
it proves the security middleware chain itself doesn't serialize/bottleneck
requests, at a scale a single-process ephemeral test harness can
meaningfully exercise.

## 5. CORS, CSRF, and security headers

- CORS: allowed origins come from `CORS_ORIGIN` (comma-separated env var,
  supports multiple environments), never a wildcard, always paired with
  `credentials: true` correctly (never wildcard + credentials together).
- Helmet: CSP (`default-src 'self'`, plus explicit Cloudinary/self allowances
  for images, `connect-src 'self'`), `X-Content-Type-Options: nosniff`,
  frame protection, HSTS in production, `X-Powered-By` disabled.
- CSRF: this API is bearer-token-only (`Authorization: Bearer <JWT>`) for
  all state-changing requests — no session/auth cookie is ever used to
  authorize a request (the refresh-token cookie, where used, is
  `httpOnly`/`sameSite`, and refresh itself doesn't mutate state beyond
  issuing a new token pair). Classic CSRF (a malicious page tricking a
  browser into replaying an ambient cookie) doesn't apply to a design
  where the attacker's page cannot read the `Authorization` header to
  forge it. Webhook endpoints are intentionally NOT behind CSRF/session
  middleware — they authenticate via provider-specific HMAC signature
  (Razorpay) or a static token (Shiprocket), which a browser-based CSRF
  attack cannot supply.
- Sensitive-response caching (Prompt 24): every `/api/v1/*` response now
  carries `Cache-Control: no-store` + `Pragma: no-cache` — the entire API
  is dynamic, per-actor JSON with no legitimate reason to be cached by a
  browser or intermediate proxy.

## 6. Input validation & injection protection

- Every request body/query/params is validated with Zod before reaching a
  service (`validate()` middleware); `listQuerySchema`'s
  `filter: z.record(z.string(), z.string())` structurally rejects operator
  objects (`{"$gt": ...}`) — a filter value must be a plain string.
  Prompt 23's product-search endpoint uses an explicit, fully-typed
  whitelist of accepted filter fields (no generic passthrough bag at all).
- `express-mongo-sanitize` is applied globally, stripping any `$`/`.`
  -prefixed keys from `req.body`/`req.query`/`req.params`.
- Regex-based search (global search, autocomplete) always escapes user
  input via `escapeRegexLiteral()` before building a `$regex` operand, and
  bounds query length via Configuration (`searchMinLength`/`searchMaxLength`).
- `hpp()` guards against HTTP parameter pollution (duplicate query keys).

## 7. Payments, orders, coupons, inventory — server-authoritative

- Razorpay webhook signature verification uses HMAC-SHA256 over the exact
  raw request bytes, compared via `crypto.timingSafeEqual` (constant-time),
  and now **fails closed** if the webhook secret isn't configured (Prompt
  24 fix — previously an unconfigured secret made the HMAC trivially
  forgeable by anyone, since `hmac('', payload)` is a known, predictable
  function of the payload alone).
- Shiprocket webhook token check now also **fails closed** when
  unconfigured (Prompt 24 fix — previously
  `if (expectedToken && provided !== expectedToken)` skipped verification
  entirely and accepted any payload when the token wasn't set) and
  compares via `timingSafeEqual` instead of `!==`.
- Order totals (`subtotal`/`gst`/`shipping`/`discount`/`grandTotal`) are
  always computed server-side from Product/Coupon/GST/Shipping services at
  checkout time — no client-supplied amount is ever accepted into a total.
  Coupons are re-validated at checkout, not trusted from an earlier cart
  state.
- Payment capture re-fetches the order server-side scoped to the
  authenticated customer and re-verifies the Razorpay signature; it never
  trusts a client-reported "payment succeeded" state.
- Inventory reservation/decrement is the sole authoritative stock source;
  no endpoint accepts a client-supplied stock quantity.

## 8. File uploads

- Bulk Excel import: 5MB size cap, MIME-type allow-list, **and** (Prompt
  24) magic-byte content-sniffing (`.xlsx` must start with the ZIP local-
  file-header bytes `PK\x03\x04` — a renamed non-spreadsheet file is
  rejected regardless of its declared `Content-Type`), a 5,000-row cap,
  and formula-injection neutralization on both import (formula cells are
  flattened to their computed value, never passed through as a raw
  ExcelJS formula object) and export (any string starting with
  `=`/`+`/`-`/`@` is prefixed with `'` so spreadsheet software renders it
  as literal text instead of evaluating it as a live formula).
- Product/prescription images go through a server-signed Cloudinary
  upload flow (the API secret never reaches the frontend); prescriptions/
  invoices/shipping-labels use private S3 objects with short-lived
  (5-minute) presigned URLs, never public-read.

## 9. Secrets & environment

- `packages/shared/src/schemas/env.schema.ts` validates every required
  variable at boot (`MONGO_URI`, `REDIS_URL`, `JWT_ACCESS_SECRET` ≥32
  chars, `CORS_ORIGIN`, base URLs); the process exits loudly
  (`process.exit(1)`) on a missing/invalid required var, never starts
  silently misconfigured. Third-party integration secrets (Cloudinary,
  Razorpay, AWS, Google, Shiprocket, SMTP) are optional and self-disable
  their feature when absent, rather than being required globally.
- No secret is ever committed — `.env.example`/`.env.production.example`
  use obvious non-shippable placeholders.
- Logging: pino's global `redact` config (not a manual per-call sanitizer)
  covers ~35 field paths — passwords, OTP codes, JWTs, refresh tokens,
  Authorization headers, cookies, Razorpay/AWS/Google/Shiprocket secrets,
  card/bank numbers, presigned URLs (treated as bearer credentials), and
  raw file bytes.

### Secret rotation

| Secret | Rotation procedure |
|---|---|
| `JWT_ACCESS_SECRET` | Rotate during a maintenance window: deploy the new secret, which invalidates every outstanding access token (15-min TTL bounds the blast radius) and every refresh token (since challenge tokens share the same secret) — expect a mass re-login. |
| Razorpay key/secret/webhook secret | Rotate in the Razorpay dashboard, update the Configuration-driven credential (or env var), verify a test webhook delivery before decommissioning the old secret. |
| Google OAuth client secret | Rotate in Google Cloud Console; update env var; no user-facing impact (server-side only). |
| AWS access key/secret | Rotate via IAM (create new key, update env var, verify uploads/downloads, deactivate then delete the old key) — never share one key across environments. |
| Cloudinary API secret | Rotate in the Cloudinary dashboard; update env var; existing signed URLs already issued remain valid only until their own short TTL expires. |
| Shiprocket credentials/webhook token | Rotate in the Shiprocket dashboard; update the Configuration-driven credential; the webhook token check now fails closed during the gap, so there is no unauthenticated-acceptance window. |
| `CONFIG_ENCRYPTION_KEY` | Rotating this key makes every ALREADY-encrypted Configuration value undecryptable (the old ciphertext was encrypted under the old key). Rotation procedure: for each namespace holding a secret field (razorpay/cloudinary/aws/shiprocket/smtp), re-save it through the admin Configuration UI (which re-reads the current plaintext via the OLD key, then re-encrypts under the NEW key on write) — do this BEFORE deploying the new key everywhere, or re-save immediately after with the plaintext value re-entered by hand if the old key is already gone. |

## 10. Encryption at rest (Part 29)

**Deliberately targeted, not blanket** (Part 29 explicitly warns against
encrypting everything): `apps/api/src/utils/field-encryption.util.ts`
encrypts only specific FIELD NAMES that are secret-shaped
(`keySecret`, `webhookSecret`, `apiSecret`, `clientSecret`,
`secretAccessKey`, `smtpPassword`/`smtpPass`, `privateKey`, `authToken`,
`accountSecret`) wherever they appear inside a Configuration document —
ordinary settings (feature toggles, numeric tunables, display text) are
left as plain, readable JSON.

**Why this exists**: `configuration.service.ts`'s `getConfiguration`/
`setConfiguration` is the ONE chokepoint every Razorpay/Cloudinary/AWS/
Shiprocket/SMTP integration already reads its credentials through
(preferring the DB-backed Configuration namespace over env vars when an
admin has populated it — the documented, pre-existing fallback pattern).
Before this fix, any credential an admin set via the Configuration UI
(rather than an env var) sat in MongoDB in plaintext — readable by anyone
with direct DB access, a backup file, or a NoSQL-injection read.

- **Algorithm**: AES-256-GCM (authenticated encryption, per Part 29's
  explicit recommendation) — each value gets its own random 12-byte IV; the
  GCM auth tag travels with the ciphertext, so a tampered stored value
  fails to decrypt rather than silently decrypting to garbage.
- **Key**: `CONFIG_ENCRYPTION_KEY` env var only (32 bytes, base64 or hex) —
  never stored beside the ciphertext (Part 29's explicit requirement), and
  optional/self-disabling like every other integration secret in this
  schema: unset, affected values are stored in plaintext exactly as before
  the fix, with a one-time startup warning logged. A malformed key (wrong
  length) also disables encryption rather than crashing the app.
- **Fully transparent to every existing caller** — `getConfiguration()`
  still returns decrypted plaintext, so `razorpay.client.ts`/
  `cloudinary.client.ts`/`shiprocket.client.ts`/S3/SMTP config code needed
  zero changes.
- **Audit trail hardening (Part 42/44/64, related finding)**: `before`/
  `after`/`metadata` passed to `recordAudit()` previously had ZERO
  redaction — a config-change audit record for a secret-bearing namespace
  stored the plaintext secret directly in the `AuditLogModel` collection,
  a second exposure point independent of the Configuration collection
  itself. Fixed by routing every audit write through the SAME recursive
  field-name-based `sanitizeForLogging()` already used for production logs
  (Prompt 18) — reused, not duplicated.

Verified end-to-end (real ephemeral MongoDB, not just pure-function unit
tests) in
`apps/api/src/integration-tests/config-encryption.integration.test.ts`: a
saved secret is unreadable in the raw stored document, `getConfiguration`
still returns the correct plaintext, re-saving rotates the ciphertext, a
non-secret namespace is untouched, and the audit record for a secret change
contains `[REDACTED]` rather than the plaintext. Plus 10 pure-function unit
tests (`field-encryption.util.test.ts`) covering round-trip correctness,
non-determinism (same plaintext → different ciphertext each time), wrong-key
failure handling, and graceful degradation when unconfigured.

## 11. Health checks, graceful shutdown, monitoring

- `GET /health` / `GET /health/live` — liveness, process-alive only, no
  dependency check (so a temporary MongoDB blip never causes a healthy
  process to be killed by an orchestrator's restart policy). This is what
  Docker's `HEALTHCHECK` hits.
- `GET /health/ready` (Prompt 24, new) — readiness: pings MongoDB
  (`mongoose.connection.readyState`) and Redis (`PING`, 2s timeout each),
  returns 503 if either is down. Does **not** call any third-party API
  (Razorpay/Cloudinary/Shiprocket/SMTP) — those are checked on-demand by
  the existing `/admin/platform-health` panel instead, never on every
  load-balancer probe.
- Graceful shutdown (`server.ts`/`worker.ts`): `SIGTERM`/`SIGINT` stop
  accepting new connections, let in-flight requests finish, close
  MongoDB/Redis, flush logs, then exit — with a 10-second forced-exit
  fallback so a hung request can never block a deploy indefinitely.
- Monitoring: Prometheus-format metrics at `/metrics` (internal Docker
  network only, not proxied externally by Nginx) — request count/latency,
  error rate, and the existing `/admin/platform-health` panel (DB/queue
  status, memory, active sessions, notification-queue depth, 24h
  audit-action summary). Kept deliberately separate from business
  analytics (revenue/orders/customers — Prompt 22) per this prompt's
  "do not mix technical monitoring and business analytics" rule.

## 12. Database backup strategy

MongoDB is Atlas-hosted (see `MONGO_URI` in deployment config) — production
backup strategy:

- **Frequency**: continuous cloud backups (Atlas's continuous/point-in-time
  backup) plus a daily snapshot.
- **Retention**: 7 daily snapshots, 4 weekly snapshots, 3 monthly
  snapshots — bounded, not indefinite (storage-cost-aware).
- **Storage**: Atlas-managed backup storage, physically separate from the
  primary cluster's storage volumes (not "a copy on the same disk").
- **Encryption**: at-rest encryption is enabled by the hosting provider by
  default for both primary data and backups.
- **Restore procedure**: restore a snapshot into a NEW cluster (never
  restore-in-place over production), point a staging environment's
  `MONGO_URI` at it, run `npm run verify:models` (confirms every index
  rebuilds cleanly) and a smoke test of core read paths (product listing,
  order lookup by a known ID) before considering the restore verified.
  A backup is not "done" until this restore-and-verify cycle has actually
  been executed at least once against a real snapshot — untested backups
  are not claimed as production-ready here.
- **Failure alerts**: configure Atlas's built-in backup-failure alerting
  to a monitored channel (email/Slack webhook) — a silently-failing backup
  job is worse than no backup, since it creates false confidence.

## 13. Known, deferred risks (not fixed in this pass)

Documented deliberately rather than silently ignored — see the final
report in the Prompt 24 session summary for full detail. Items 1-3 below
were originally deferred pending major-version upgrades; a follow-up pass
completed all three (`npm audit` now reports 0 vulnerabilities). Their
resolution is documented here rather than deleted, so the reasoning behind
each fix stays visible.

### Resolved in follow-up pass

1. **`react-router-dom` moderate CVE** (open-redirect via backslash,
   SSR-hydration constructor injection) — upgraded `react-router-dom` from
   `^6.28.0` to `^7.18.2` in `apps/web/package.json`. This app is a CSR SPA
   with no SSR usage, so the SSR-hydration half of the advisory never
   applied here. For the open-redirect half, a full audit (not just a spot
   check) found one real reachable path: `LoginPage.tsx`'s post-login
   redirect reads `location.state.from` (set by `ProtectedRoute.tsx` from
   `location.pathname` when redirecting an unauthenticated user to
   `/login`) and passes it straight into `<Navigate to={from}>` /
   `navigate(from)`. Since `location.pathname` reflects whatever URL the
   visitor actually landed on, an attacker-crafted link with backslashes
   in the path could reach this `to` prop. `react-router@7.18.0` shipped
   "Consolidate url normalization logic and better handle mixed slashes"
   (PR #15176), which is the fix for this exact advisory
   (GHSA-wrjc-x8rr-h8h6). No application code changes were needed —
   `apps/web/src/routes/AppRouter.tsx` and all `useNavigate`/`<Link>`/
   `useParams`/`useSearchParams`/`useLocation` call sites use only the
   classic declarative `<BrowserRouter>/<Routes>/<Route>` API (no
   `createBrowserRouter`, loaders, or actions), which is unchanged between
   v6 and v7. Verified via `tsc --noEmit`, `eslint`, `vite build`, and a
   manual click-through of the storefront (home → products → product
   detail → search → 404) and the auth/protected-route redirect flow
   (unauthenticated visits to `/account` and to a role-gated
   `/admin/catalog/products` both correctly redirect to `/login`) with a
   live dev server — no console errors, no broken routes.
2. **`tar`/`@mapbox/node-pre-gyp` critical+high advisories** — upgraded
   `bcrypt` from `^5.1.1` to `^6.0.0` in `apps/api/package.json`. bcrypt
   6.0.0 replaced the `@mapbox/node-pre-gyp`/`tar` native-addon build chain
   with `node-gyp-build`/`node-addon-api`, removing the vulnerable
   dependency entirely rather than patching it. The `bcrypt.hash`/
   `bcrypt.compare` call sites (`auth.service.ts`, `admin-user.service.ts`,
   `profile.service.ts`, `token-hash.util.ts`, `test-support/fixtures.ts`)
   use only the stable core API, unchanged across the major bump — no code
   changes were required. Verified via `tsc --noEmit`, the full unit suite
   (258 tests), and the full integration suite (69 tests), all passing.
3. **`exceljs` → `uuid` moderate advisory** — no upstream `exceljs` release
   fixes this yet (checked `4.4.1-prerelease.0`, the latest available
   version; it still pins `uuid: ^8.3.0`). Two things changed instead:
   (a) `apps/api/package.json` had an unused direct `uuid`/`@types/uuid`
   dependency (never imported anywhere in `apps/api/src`) that was itself
   flagged by the audit — removed as dead code; (b) added a root-level npm
   `overrides` entry (`"uuid": "^11.1.1"`) to force `exceljs`'s nested
   `uuid` dependency to a patched version. This is safe because
   `exceljs`'s only use of `uuid` (`lib/xlsx/xform/sheet/cf-ext/
   cf-rule-ext-xform.js`) calls `uuidv4()` with zero arguments — the
   GHSA-w5hq-g745-h8pq advisory is specifically about a missing bounds
   check in `v3`/`v5`/`v6` when a caller-supplied `buf` is provided; `v4`
   isn't even in the affected function list, and no `buf` argument is ever
   passed here. Confirmed the override actually took effect (`npm ls uuid
   --all` shows `uuid@11.1.1` resolved under `exceljs`) and reran the full
   unit suite (including the `parseExcelBuffer`/`buildExcelBuffer` tests)
   and integration suite — all passing, `npm audit` now clean.

### Still deferred

4. **No CDN/WAF layer documented** — this pass hardens the application and
   Nginx edge; a production deployment should still sit behind a CDN/WAF
   (e.g. Cloudflare) for DDoS absorption beyond what `express-rate-limit`
   can do at the application layer. Out of scope for an application-code
   security pass.
5. **TLS certificates are not provisioned by default** in this checkout —
   `infra/nginx/ssl.conf` is a documented placeholder; real certificates
   must be provisioned via `infra/scripts/init-letsencrypt.sh` (or
   equivalent) before any production deploy. This is intentional
   bootstrapping design, not an oversight, but is called out explicitly
   here so it is never mistaken for "already done."
6. **The 500–2,000-concurrent-user infrastructure load test, real
   browser/customer/admin bot simulation, and full deployment/rollback
   validation are explicitly out of scope for this pass** — the master
   prompt series defers that to a later, dedicated load/E2E prompt. Part
   73's concurrency tests here (see §4) prove the security middleware chain
   itself isn't a bottleneck at a scale an ephemeral single-process test
   harness can meaningfully exercise; they are not a substitute for
   real infrastructure load testing.

## 14. Production configuration checklist (Part 70)

A deployment is not production-ready just because the application code is
hardened — the following must ALSO be true. This list intentionally never
shows a real secret value; `.env.production.example` documents every
variable's shape.

**Core**
- [ ] `NODE_ENV=production`
- [ ] `API_BASE_URL`/`WEB_BASE_URL` point at the real production domains
- [ ] `CORS_ORIGIN` lists ONLY real production frontend origin(s) — never
      `localhost`, never a wildcard

**Database & cache**
- [ ] `MONGO_URI` points at the production Atlas cluster (never shared with
      staging/dev — see §"Environment separation" risk above), uses a
      least-privilege DB user, and requires TLS (Atlas default)
- [ ] `REDIS_URL` requires AUTH and has persistence (AOF) enabled — see
      `infra/docker/docker-compose.prod.yml`'s redis service
- [ ] Backup strategy provisioned and a restore has actually been tested
      (§12) — not just documented

**Secrets**
- [ ] `JWT_ACCESS_SECRET` — unique per environment, ≥32 bytes,
      `openssl rand -base64 48`
- [ ] `CONFIG_ENCRYPTION_KEY` — set if ANY third-party credential will ever
      be configured via the admin UI rather than env vars (§10)
- [ ] Razorpay/Cloudinary/AWS/Google/Shiprocket/SMTP credentials — all
      production-tier (never staging/test credentials), none committed to
      source
- [ ] No secret is baked into a Docker image (verified — see `apps/api/Dockerfile`)

**Network & edge**
- [ ] Real TLS certificate provisioned (§13 item 5) and HTTP→HTTPS redirect
      active
- [ ] CDN/WAF in front of Nginx if available (§13 item 4 — not built by
      this application-code pass)
- [ ] `trust proxy` setting (`app.set('trust proxy', 1)`) matches the ACTUAL
      number of reverse-proxy hops in front of the API — wrong on either
      side and rate limiting/IP-based logic silently breaks or becomes
      spoofable

**Rate limits & CORS**
- [ ] `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` reviewed for production
      traffic volume (defaults are dev-sized)
- [ ] Confirmed `CORS_ORIGIN` does not accidentally include a staging/dev
      origin

**Observability**
- [ ] `/health`, `/health/live`, `/health/ready` wired into the
      orchestrator's liveness/readiness probes respectively (§11) — NOT the
      same probe for both
- [ ] `/metrics` reachable by Prometheus over the internal network only,
      never exposed externally by Nginx
- [ ] Log aggregation/retention configured downstream of the app's own
      6-hour-rotation + S3-archival pipeline (Prompt 18)
- [ ] Alerting configured for: backup failures (§12), elevated error rate,
      elevated `RATE_LIMITED`/`FORBIDDEN` response volume (possible attack
      in progress), webhook signature-verification failures

**Post-deploy smoke test** (Part 77 — no business-logic regression)
- [ ] Product listing/detail loads
- [ ] A real (or sandbox) Razorpay checkout completes end-to-end
- [ ] Invoice PDF generates and is retrievable
- [ ] Admin login works and RBAC-restricted pages are actually restricted
      for a non-super_admin test account
- [ ] `/health` and `/health/ready` both return 200
