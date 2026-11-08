# BRENTIS — Admin Role Management (RBAC)

This system already had a mature, resource+action RBAC implementation and a fully built Admin User Management screen before this pass — this document describes what exists today, what was verified by live testing in this pass, and the one addition made (`mustChangePassword` on admin-created/reset accounts).

## 1. Role hierarchy

Two tiers, defined in `packages/shared/src/constants/roles.ts`:

1. **Super Admin** (`super_admin`) — full administrative control. `authorize()` middleware (`apps/api/src/middlewares/rbac.middleware.ts`) gives this role an implicit bypass of every granular permission check.
2. **Admin** (`admin`) — access to explicitly permitted operational modules only. No implicit bypass; every action is checked against the role's (plus any per-user override's) effective permission set.

Two other, narrower roles exist for completeness but aren't part of this spec's "employee admin" concept: `inventory_manager` (a scoped operational role) and `customer`/`distributor` (storefront-only, never admin-panel accounts).

## 2. Permission model

Resource + action pairs, e.g. `products:update`, `orders:read`, `categories:delete` — built via `permission(RESOURCES.PRODUCTS, ACTIONS.UPDATE)` (`packages/shared/src/constants/permissions.ts`). `RESOURCES` already covers every module this spec names: Products, Inventory (via `BATCHES`/`STOCK_ADJUSTMENTS`/etc.), Orders, Customers, Categories, Blogs (`CMS`), Website content (`CMS`), Reports (`ANALYTICS`/`REPORTS`).

Roles are **data**, not hardcoded logic — `RoleModel` documents (`permissions: string[]`), seeded by `apps/api/src/scripts/seed-roles.ts` and editable at runtime through the Roles admin screen (`apps/web/src/modules/superadmin/pages/RolesPage.tsx`: view/edit a role's permission set, clone a role, import/export as JSON).

**Effective permissions** for a request = (that user's role's permissions) ∪ (per-user `UserPermission` grants) − (per-user `UserPermission` denies — deny always wins over grant), computed in `getEffectivePermissions()`, Redis-cached for 60s. A role change invalidates the cache immediately.

Verified live in this pass: the default `admin` role (as currently seeded in this environment) has broad operational permissions (products, bundles, categories, brands, ... full CRUD+export+import+refund+approve) but **no** `users:update` permission — meaning an ordinary admin cannot reach any admin-user-management endpoint at all by default. This is the correct, secure default; granting it is an explicit per-role or per-user decision a Super Admin makes.

## 3. Admin User Management (already fully built — `apps/web/src/modules/superadmin/pages/AdminUsersPage.tsx`)

Reachable only to accounts with `users:update` (ordinarily Super Admin only, since the default `admin` role doesn't have it). Capabilities:
- **List** admin users, paginated, filterable by role.
- **Create** a new admin user — name, email, temporary password (set directly by the creating Super Admin; there is no separate email-invitation-link flow — see §5), role. As of this pass, every account created this way is flagged `mustChangePassword: true`.
- **Change role** — two-step: pick the new role, then an explicit confirm dialog showing "Current → New", with an additional warning step if the change involves granting or touching `super_admin`.
- **Activate / Deactivate** — inline toggle.
- **Suspend / Unsuspend** — with an optional reason, confirm dialog, visually marked as a dangerous action.
- **Reset password** (admin-initiated) — sets a new password directly; as of this pass, this also flags the target account `mustChangePassword: true` and revokes all of that account's existing sessions.
- **View activity history** — `apps/web/src/modules/superadmin/pages/AuditCenterPage.tsx` shows the audit trail (see §4) for role/status/password changes and other sensitive admin actions.

## 4. Super-Admin protection guards (pre-existing, verified live in this pass)

All three live in `apps/api/src/modules/auth/admin-user.service.ts`, enforced server-side (never trusting anything the browser sends about its own role):

| Guard | What it blocks | Verified |
|---|---|---|
| `assertCanAssignRole` | A non-super_admin actor granting the `super_admin` role to anyone (including via create or role-change) | Live-tested: an `admin`-role account with `users:update` granted got `403 "Only a Super Admin can grant the Super Admin role"` on both create-as-super_admin and self-promote-to-super_admin attempts |
| `assertCanManageTarget` | (a) An actor modifying their own account through this endpoint, (b) a non-super_admin actor modifying ANY super_admin account | Live-tested: self-promote attempt got `403 "You cannot modify your own admin account through this endpoint"`; modifying the real Super Admin account got `403 "Only a Super Admin can manage another Super Admin account"` |
| `assertNotLastSuperAdmin` | Demoting/deactivating/suspending the only remaining usable super_admin | Not independently live-testable through the current endpoints — by construction, given the two guards above, any valid actor reaching this check is *itself* a different, usable super_admin the moment `target != actor`, so a true "last one" scenario can't currently occur through the UI/API (documented in the code's own comment). Kept as defense-in-depth. |

Audit trail: `recordAudit()` is called from every one of these mutations (`apps/api/src/modules/audit/audit.service.ts`), capturing actor, before/after state (redacted via the same `sanitizeForLogging` used for application logs), and viewable in Audit Center.

## 5. What "invite a new employee" means in this system today

The spec's language ("invite a new employee using email") could mean a token-based email-invitation-link flow (new account created in a pending state, employee clicks a link to set their own first password) or the simpler "create their account using their email address" flow this system already has. This pass kept the existing direct-creation flow rather than building a parallel email-invitation-token system, for two reasons:
1. It would substantially duplicate the password-reset token machinery (`VerificationToken`, hashed tokens, expiry, single-use) for a workflow that's functionally similar.
2. The new `mustChangePassword` flag added in this pass closes the main security gap a direct-creation flow has (an admin-chosen password being used long-term) — the account is unusable with its original temp password beyond the first login.

If a true email-invitation-link flow is wanted later, `VerificationToken`'s existing `purpose` enum is the natural extension point (a new `admin_invitation` purpose, same hash-and-expire pattern already used for password reset and email verification).

## 6. Security safeguards checklist (from the spec)

| Requirement | Status |
|---|---|
| Enforce permissions on backend APIs, not just frontend nav | Already true — every admin route is behind `authorize()`; frontend nav hiding is a UX convenience only |
| Never trust a role supplied by the browser | Already true — role comes from the server-issued JWT's `sub`/DB lookup, never a client-supplied field |
| Prevent privilege escalation | `assertCanAssignRole` — verified live |
| Prevent deletion/demotion of the last active Super Admin | `assertNotLastSuperAdmin` — verified by code reading (see §4) |
| Prevent an Admin from modifying their own role | `assertCanManageTarget`'s self-modification block — verified live |
| Record who granted/revoked access | `recordAudit()` on every mutation, `actorId` captured |
| Maintain audit logs for role changes and sensitive actions | Audit Center — pre-existing |
| Require a password change where appropriate | **Added this pass** — `mustChangePassword` on admin-created/reset accounts |
| No public registration route can choose Admin role | Already true — `POST /auth/register` always creates `role: ROLES.CUSTOMER`, hardcoded, not client-supplied |

## 7. Related docs
- `docs/BRENTIS_ADMIN_BOOTSTRAP_GUIDE.md` — creating/recovering the first Super Admin, day-to-day operator procedures.
- `docs/BRENTIS_AUTHENTICATION_AND_SECURITY.md` — the auth flow `mustChangePassword` hooks into.
- `docs/BRENTIS_UX_VALIDATION_AUDIT.md` — full test results, including the RBAC security tests summarized in §4 above.
