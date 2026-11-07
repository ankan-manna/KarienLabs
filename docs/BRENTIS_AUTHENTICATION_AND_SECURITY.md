# BRENTIS — Authentication & Security

Covers the customer authentication flow as it exists today (login, registration, password reset), what was found already correctly implemented, what was actually fixed/added in this pass, and the current password/session security model. Written after a full code audit of `apps/api/src/modules/auth/` and `apps/web/src/modules/auth/` — see §13 for a pointer to the scoping plan that drove this work.

## 1. Summary of changes in this pass

| Area | Status before | Change made |
|---|---|---|
| Password reset backend (token gen, hashing, expiry, single-use, session revocation) | Already fully implemented | None — verified only |
| Password hashing (bcrypt, cost 12) | Already correct, consistent everywhere | None |
| Password policy (min 8, upper/lower/digit, no special-char restriction) | Already correct, matches spec baseline | None |
| Email normalization (trim + lowercase) before login/register/forgot-password lookups | **Missing** — case-sensitive lookup bug | Added `.toLowerCase()` to the shared email schema, both frontend and backend |
| Password-reset email content | Backend fully wired, but **zero** notification templates existed, so a real reset email had no usable link | Seeded 3 templates (`password_reset`, `password_reset_confirmation`, `password_reset_otp`); server now builds a safe `resetUrl` instead of ever passing the raw token to the template layer |
| Show/hide password toggle | **Missing** everywhere | Added to the shared `Input` component — applies automatically to every password field in the app |
| Terms & Conditions / Privacy Policy consent on registration | **Missing** | Added mandatory checkboxes, server + client validation, consent stored with timestamp + policy version |
| Forced password change for admin-assigned passwords | **Missing** | New `mustChangePassword` flag, enforced via a route guard, cleared on successful change |
| Dark-mode text contrast on auth pages | Several ungraded `text-gray-500`/`text-red-600`/`text-amber-700` instances | Added `dark:` variants throughout |

## 2. Customer authentication flow

### Registration (`POST /auth/register`)
1. Client validates name/email/password/confirmPassword/acceptedTerms/acceptedPrivacy with zod (`apps/web/src/validators/auth.validators.ts`).
2. Server re-validates the same rules independently (`apps/api/src/modules/auth/auth.validator.ts` `registerSchema`) — the client validation is a UX convenience, never the source of truth.
3. Email is normalized (`trim().toLowerCase()`) before the duplicate-email check and before it's stored.
4. `acceptedTerms`/`acceptedPrivacy` must both be the literal boolean `true` — anything else (omitted, `false`) fails validation with a specific per-field message (`"You must accept the Terms & Conditions"` / `"You must confirm you have read the Privacy Policy"`).
5. On success, the account's `consent.terms`/`consent.privacy` sub-documents are set to `{ accepted: true, acceptedAt: <now>, version: <current policy version> }` — see §4.
6. If registration-OTP is enabled (`Configuration('auth').registrationOtpEnabled`), the account is created but email-unverified and a challenge token + OTP are issued; the session is only granted after `POST /auth/register/verify-otp`. Otherwise a session is issued immediately.
7. Duplicate email → `409 Conflict`, `"An account with this email already exists"`.

### Login (`POST /auth/login`)
- Email-only (no username field exists anywhere in this system) — normalized the same way as registration.
- bcrypt-compares the submitted password against `passwordHash` (never returned in any API response — the schema field is `select: false`).
- Account lockout: 5 failed attempts locks the account for 15 minutes (`failedLoginAttempts`/`lockedUntil` on `User`) — pre-existing, unchanged by this pass.
- If `mustChangePassword` is true on the account, login still succeeds and a session is issued — the **frontend** (`ProtectedRoute`) then redirects to the account's profile page before anything else is reachable (see §5).
- Optional login-OTP flow (config-gated), same two-step pattern as registration.

### Forgot password (`POST /auth/forgot-password` → `POST /auth/reset-password`)
Two parallel flows exist, chosen by `Configuration('auth').otpPasswordResetEnabled`:

**Link-based (default):**
1. `requestPasswordReset(email)` looks up the user by normalized email. Whether or not a matching, active account exists, the endpoint returns the identical `{ requested: true }` response — **no email enumeration**.
2. If a user was found: a 64-byte random token is generated, hashed (`token-hash.util.ts`, SHA-256) and stored in `VerificationToken` with `purpose: password_reset`, `expiresAt: now + 30 minutes`. The **raw** token is never stored anywhere.
3. The server builds `resetUrl = \`${WEB_BASE_URL}/reset-password?token=${rawToken}\`` and queues a `password_reset` email containing that link — the raw token itself is never handed to the notification/template layer directly (see §3).
4. `POST /auth/reset-password { token, password }` re-hashes the submitted token and looks it up; rejects if not found, already consumed, or past `expiresAt`, with the message `"Reset link is invalid or has expired"` in all three cases (deliberately identical — doesn't distinguish "expired" from "already used" from "never existed").
5. On success: new bcrypt hash saved, the `VerificationToken` is marked `consumedAt`, **every refresh token for that user is revoked** (`logoutAllSessions`) so a stolen-password scenario can't keep an attacker's existing session alive, and a `password_reset_confirmation` email is sent.

**OTP-based (opt-in via Configuration):** same no-enumeration guarantee, but issues a 4–8 digit code instead of a link; `POST /auth/forgot-password/verify-otp` exchanges a correct code for a short-lived (10 min) `resetSessionToken` JWT, which `POST /auth/reset-password { resetSessionToken, password }` then consumes the same way.

### Change password (logged in) — `POST /auth/change-password`
Requires the current password. On success: new hash saved, `mustChangePassword` cleared, every *other* session's refresh token revoked (keeps the current one alive so the user isn't logged out of the device they're using).

## 3. Password-reset email — what was actually broken and the fix

Email is sent via nodemailer/SMTP (`apps/api/src/integrations/notifications/email-transport.ts`) through a central BullMQ dispatch worker, rendering admin-authored Handlebars templates from `NotificationTemplateModel`. This architecture was already correct and already configured with real SMTP credentials — but **no template existed for any of the three password-reset-related keys**, so the worker's no-template fallback (a raw `Key: value` dump of the notification payload) was the only thing a customer would ever actually receive, and the only field being passed was the bare `token` — not a clickable link.

Two fixes:
1. `auth.service.ts`'s `requestPasswordReset` now builds the full `resetUrl` server-side and passes **that** (not the raw token) to the notification layer. `token` is in this codebase's own global forbidden-variable list for templates (`notification-template-variables.util.ts`) — a deliberate rule preventing any admin-authored template from ever referencing a bare secret token — so this is also what the architecture already intended, just not wired up.
2. A new idempotent script, `apps/api/src/scripts/seed-notification-templates.ts` (`npm run seed:notification-templates`), seeds real HTML content for `password_reset`, `password_reset_confirmation`, and `password_reset_otp`. It only creates a template if none exists for that `{key, channel}` — never overwrites one an admin has since customized through the Notification Settings admin screen.

**Verified in this environment:** requesting a reset correctly creates the `VerificationToken`, queues a `NotificationQueue` row with a correctly-formed `data.resetUrl` (`http://localhost:5173/reset-password?token=...`), and the reset/login flow works end-to-end using that token. The actual outbound SMTP **send** failed in this sandboxed environment with `self-signed certificate in certificate chain` — a network/TLS interception artifact of the sandbox, not a code defect; see `docs/BRENTIS_UX_VALIDATION_AUDIT.md` §Testing for the full result and what to check in a real deployment environment.

## 4. Terms & Privacy consent storage

`User.consent`:
```ts
consent: {
  terms:   { accepted: boolean, acceptedAt: Date | null, version: string | null },
  privacy: { accepted: boolean, acceptedAt: Date | null, version: string | null },
}
```
- Written once, at registration, from the validated `acceptedTerms`/`acceptedPrivacy` booleans — never inferred or defaulted to `true`.
- `version` comes from `apps/api/src/modules/auth/consent-policy.constants.ts` (`CURRENT_TERMS_VERSION`/`CURRENT_PRIVACY_VERSION`) — bump these constants whenever the published Terms/Privacy page content materially changes, so existing users' stored version correctly reflects what they actually agreed to, not the current content.
- **Pre-existing accounts** (created before this field existed) have `consent.terms.accepted: false` by default — this is accurate, not a bug: those accounts registered before any consent mechanism existed, so there is nothing true to backfill. This is a known, accepted gap for legacy accounts, not something this pass retroactively fabricates.
- This is entirely separate from any marketing-email opt-in — no such field exists anywhere in this codebase today, so there's no risk of the two being conflated.

## 5. `mustChangePassword` — forced password rotation

New boolean field on `User`, `default: false`. Set to `true` by:
- `admin-user.service.ts::createAdminUser` — an admin-created staff account's password was chosen by the creating admin, not the employee.
- `admin-user.service.ts::resetUserPassword` — an admin-initiated reset on an existing account.
- The new `reset-super-admin-password.ts` recovery script (§ see `docs/BRENTIS_ADMIN_BOOTSTRAP_GUIDE.md`).

Cleared to `false` by `auth.service.ts::changePassword` on a successful self-service change.

Enforcement is entirely in `apps/web/src/routes/ProtectedRoute.tsx`: after the existing auth check and before the existing role/permission checks, if `user.mustChangePassword` is true and the current route isn't already the account's own profile page (`getProfilePath(role)` — `/admin/profile` for staff roles, `/account/profile` for customers), the visitor is redirected there with `state: { forcedPasswordChange: true }`. Both profile pages read that state to show an explanatory banner. This is a **client-side UX gate**, not a backend authorization boundary — session tokens remain valid and every other API endpoint still enforces its own normal RBAC checks regardless of this flag; a determined user could call other APIs directly with a valid token while `mustChangePassword` is true. This was judged acceptable for this pass (the spec asks for a UX flow, not a hard API lockout) but is worth hardening later if a true backend-enforced lockout is required — see `docs/BRENTIS_UX_VALIDATION_AUDIT.md`'s remaining-items section.

## 6. Session/token model (pre-existing, unchanged)

- Access token: short-lived (15 min default) JWT, `{sub, role}`, HS256.
- Refresh token: opaque random value, stored **hashed** server-side, httpOnly cookie, rotation-on-use with family chaining — reusing an already-rotated/revoked refresh token revokes the entire family (theft detection).
- No per-access-token revocation list exists; instead `requireAuth` re-checks a Redis-cached (60s TTL) account status (`isActive`/`isSuspended`/`deletedAt`) on every request, and role/status changes explicitly invalidate that cache — so a suspend/deactivate/role-change takes effect within ~60s even against an unexpired access token.

## 7. Never done, confirmed

- Plaintext passwords are never stored (bcrypt cost 12 throughout) or logged (`sanitizeForLogging` redacts any field whose name contains `password`/`token`/similar, applied to audit records too — confirmed live: the recovery script's audit record shows `mustChangePassword: '[REDACTED]'` even though the value was just `true`, i.e. the redaction is deliberately conservative).
- `passwordHash` is `select: false` on the schema and is never included in any `toPublicUser`/`toPublicAdminUser` response mapper.
- Reset tokens are stored hashed, never in plaintext, and are single-use.

## 8. Related docs
- `docs/BRENTIS_ADMIN_ROLE_MANAGEMENT.md` — RBAC, roles, admin user management.
- `docs/BRENTIS_ADMIN_BOOTSTRAP_GUIDE.md` — Super Admin creation/recovery procedures.
- `docs/BRENTIS_UX_VALIDATION_AUDIT.md` — validation rules, dark-mode audit, and the actual test results for everything described above.
