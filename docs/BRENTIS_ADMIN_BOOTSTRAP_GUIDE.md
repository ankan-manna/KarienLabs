# BRENTIS — Super Admin Bootstrap & Recovery Guide

Operator-facing runbook for creating, recovering, and managing Super Admin access. Every script here is run manually from a terminal against an explicitly-selected database (via the normal `MONGODB_URI`/environment the API process already uses) — **none of this is exposed as an HTTP endpoint**, so it can never be triggered by an ordinary user or a public request.

## What happened to the original Super Admin account (investigated in this pass)

The account was **not deleted**. It still exists in the database (`superadmin@medcommerce.local`, created 2026-08-28, `role: super_admin`, `isActive: true`, never suspended). The problem: `seed-super-admin.ts` reads its password from the `SUPER_ADMIN_PASSWORD` environment variable **at the moment it's run** — it never stores that plaintext value anywhere, only its bcrypt hash. The current `.env` has no `SUPER_ADMIN_*` variables at all, so whatever password was used back in August is unrecoverable from the current environment; the bcrypt hash itself cannot be reversed. A live login attempt with the password string the user expected returned `401 Invalid email or password`, and the account's `failedLoginAttempts` was already at 4 of 5 (one more failed attempt away from a 15-minute lockout).

This is exactly the "account exists, nobody has its current password" scenario this guide's recovery procedure (§3) exists for. **The account was not silently reset** — it was recovered using the explicit, audited procedure below, and the fact that it happened is recorded in the audit log (`actorType: SYSTEM`, `actorName: "reset-super-admin-password script"`).

## 1. Create the first Super Admin

Script: `apps/api/src/scripts/seed-super-admin.ts` — `npm run seed:super-admin` (from `apps/api`).

```bash
SUPER_ADMIN_EMAIL="superadmin@medcommerce.local" \
SUPER_ADMIN_PASSWORD="<a strong password meeting the password policy>" \
SUPER_ADMIN_NAME="Super Admin" \
npm run seed:super-admin --workspace=apps/api
```

- **Idempotent**: if a `super_admin` account already exists anywhere in the target database, this is a safe no-op — it logs the existing account's email and exits without touching anything. It will never create a second Super Admin this way.
- If no `super_admin` exists yet, but the requested `SUPER_ADMIN_EMAIL` already belongs to a non-super_admin account, it refuses and errors rather than overwriting that account.
- Password is validated against the same `passwordSchema` every other password in the app uses (min 8 chars, needs upper/lower/digit) before anything is written.
- Never commit real values for these env vars to Git — pass them inline on the command line (as above) or through your deployment platform's secret store, never a checked-in `.env`.

## 2. Create an additional Super Admin

Once the first one exists, do this through the **application**, not another script run — `seed-super-admin.ts` deliberately won't create a second one. Log in as an existing Super Admin, go to **Admin → Admin Users**, create a new user with `role: Super Admin` directly (Super Admins are the only accounts allowed to grant that role — enforced server-side by `assertCanAssignRole`, see `docs/BRENTIS_ADMIN_ROLE_MANAGEMENT.md`). The new account is flagged `mustChangePassword: true`, so its first login will be gated into changing the temp password before anything else is reachable.

## 3. Recover Super Admin access (account exists, password unknown/lost)

Script: `apps/api/src/scripts/reset-super-admin-password.ts` — `npm run reset:super-admin-password` (from `apps/api`).

```bash
SUPER_ADMIN_EMAIL="superadmin@medcommerce.local" \
SUPER_ADMIN_RESET_PASSWORD="<a new strong password>" \
npm run reset:super-admin-password --workspace=apps/api
```

Deliberately a **separate** script and a **separate** env var name (`SUPER_ADMIN_RESET_PASSWORD`, not `SUPER_ADMIN_PASSWORD`) from the bootstrap script — the two can never be confused or accidentally chained in an automated pipeline. What it does, every time, non-silently:

1. Finds the account with `role: super_admin` matching the given email. Refuses (with a message pointing at `seed-super-admin.ts` instead) if none exists — this script never creates an account, only recovers an existing one.
2. Sets a new bcrypt hash for the new password (validated against `passwordSchema` first).
3. Resets `failedLoginAttempts` to 0 and clears `lockedUntil` — a recovery shouldn't leave the account one bad guess from a fresh lockout.
4. Sets `mustChangePassword: true` — this password now exists somewhere outside the account holder's own memory (shared in a chat, a ticket, a terminal history), so it must be rotated on first use.
5. Revokes every existing session for that account (`logoutAllSessions`) — same theft-recovery posture the self-service reset flow uses.
6. Writes an audit record (`actorType: SYSTEM`) — this action is traceable later via Audit Center, same as any other sensitive account change.
7. Logs a confirmation summary — **never the password itself**.

**Used in this pass:** this exact procedure was run once to restore access to `superadmin@medcommerce.local`, using the credentials supplied directly in the request. Verified live afterward: login succeeds, `mustChangePassword: true` is present on the session's user object, the account is unlocked (`failedLoginAttempts: 0`), and a case-insensitive/whitespace-tolerant login also now works correctly (see the email-normalization fix in `docs/BRENTIS_AUTHENTICATION_AND_SECURITY.md`).

## 4. Change a Super Admin's own password

Normal, no special procedure: log in, go to **Profile → Change Password**, enter the current password + new password. This is the same `changePassword` endpoint every account uses; it clears `mustChangePassword` on success and revokes every *other* session (the current one stays alive).

## 5. Disable a Super Admin safely

Through **Admin → Admin Users**, as a *different* Super Admin (the system will not let any account, including another Super Admin, deactivate itself through this screen — `assertCanManageTarget`'s self-modification block applies universally). If this would leave zero usable Super Admins, the action is blocked with a clear error (`assertNotLastSuperAdmin`) — promote a replacement first.

## 6. Verify assigned roles

- **Admin → Admin Users** lists every admin account with its current role and active/suspended status.
- **Admin → Roles** shows each role's full permission set and lets you compare/export them.
- **Admin → Audit Center** shows the history of who changed what, including every role assignment.
- Via the database directly (read-only, for incident response): `db.users.find({ role: { $in: ['super_admin', 'admin'] } }, { name: 1, email: 1, role: 1, isActive: 1, isSuspended: 1, mustChangePassword: 1 })`.

## 7. Environment configuration this all depends on

| Variable | Used by | Notes |
|---|---|---|
| `MONGODB_URI` (or equivalent already configured) | Every script here | Scripts connect to whatever database the API process is configured for — **always confirm you're pointed at the intended dev/staging database before running a bootstrap/recovery script**, never run these against a production URI without deliberate intent |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | `seed-super-admin.ts` only | Pass inline on the command line or via your platform's secret manager — never commit to `.env` in the repo |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_RESET_PASSWORD` | `reset-super-admin-password.ts` only | Same handling — never commit |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` | Password-reset emails, order emails, etc. | Already configured in this environment's `.env`. If unset anywhere, the email transport safely no-ops (logs only, never throws) rather than faking a successful send — see `docs/BRENTIS_AUTHENTICATION_AND_SECURITY.md` §3 |
| `WEB_BASE_URL` | Building the password-reset link | Already set (`http://localhost:5173` in this dev environment) — must match wherever the frontend is actually reachable in each environment |

## 8. Safety notes

- Neither script is reachable over HTTP — they only run from a terminal with direct database access, which is itself the access-control boundary.
- Neither script ever prints a password to logs.
- Both validate the target database connection the same way every other script in `apps/api/src/scripts/` does — there is no separate "production-safe mode" flag; the operator's own `MONGODB_URI` selection **is** the environment selection, so always double-check it before running either script.
