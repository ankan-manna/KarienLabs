# BRENTIS — UX, Validation & Dark-Mode Audit

Validation rules reference, consent storage schema, the dark-mode audit findings (page by page), and the actual test results from this pass — every test below was executed against the running dev stack, not assumed.

## 1. Validation rules reference

| Field | Rule | Enforced |
|---|---|---|
| Email (login/register/forgot-password) | Trimmed, lowercased, valid email format | Client (zod) + server (zod), identical logic |
| Password (register/reset/admin-create) | 8–128 chars, at least one lowercase, one uppercase, one digit; no restriction on special characters or length-driven passphrases | Client + server, shared `passwordSchema` pattern |
| Confirm password | Must exactly match `password` | Client zod `.refine`, with the error attached to `confirmPassword` specifically |
| `acceptedTerms` | Must be the literal boolean `true` | Client + server (`z.literal(true)`) |
| `acceptedPrivacy` | Must be the literal boolean `true` | Client + server |
| Login credentials | Generic `"Invalid email or password"` on any mismatch — never reveals which field was wrong | Server |
| Duplicate email on register | `409 Conflict`, specific message | Server |
| Network/API errors | Caught and shown as a form-level banner distinct from field errors (fixed a real gap in `ForgotPasswordPage.tsx`, which previously had no try/catch around its API call at all) | Client |

All of the above are shown **inline**, next to the relevant field (or as a form-level banner for request-level failures), never only as a generic alert. Every auth form disables its submit button and shows a loading state while a request is in flight (`isSubmitting` from react-hook-form), preventing duplicate submissions. Entered values are preserved on any validation or API failure (react-hook-form doesn't clear fields on error; confirmed live — see §5).

## 2. Consent storage schema

```ts
// User.consent
{
  terms:   { accepted: boolean, acceptedAt: Date | null, version: string | null },
  privacy: { accepted: boolean, acceptedAt: Date | null, version: string | null },
}
```
Policy version strings come from `apps/api/src/modules/auth/consent-policy.constants.ts` — currently `'2026-11-07'` for both. See `docs/BRENTIS_AUTHENTICATION_AND_SECURITY.md` §4 for the full rationale, including why pre-existing accounts correctly show `accepted: false` rather than a fabricated `true`.

## 3. Dark-mode audit — page by page

Audited every page the spec named. Two were found **already fully correct** (no changes needed); the rest had narrow, specific gaps that were fixed.

| Page | Finding | Action |
|---|---|---|
| About Us, Privacy Policy, Terms & Conditions, Shipping Policy, Return Policy, Refund Policy, Cancellation Policy (all share `CmsPageView.tsx`) | **Already fully correct** — every prose element selector (`h2`, `p`, `ul`, `table`, `blockquote`, `thead`, borders) already had a `dark:` variant | None needed |
| Login | `text-gray-500`/`text-gray-400` captions, `text-red-600`/`text-amber-700` banners had no `dark:` text-color variant (only the background did) | Fixed — added `dark:text-night-muted`/`dark:text-red-400`/`dark:text-amber-400` throughout |
| Registration | Same pattern as Login, same fix. Also: new consent checkboxes/errors built with dark-mode coverage from the start | Fixed |
| Forgot Password | Same pattern. Also had no form-level error banner at all in the main request step (a real functional gap, not just a color gap — see §1) | Fixed (color + the missing try/catch) |
| Reset Password | Same color pattern | Fixed |
| Blog listing | One ungraded `text-gray-400` ("No image" placeholder) | Fixed |
| Blog detail | No gaps found | None needed |
| Product listing | Two ungraded `text-gray-400` instances (price-range separator, an inline filter-chip icon) | Fixed |
| Product details | Six ungraded `text-gray-500`/`text-gray-400` instances — the medicine-info `<dd>` rows (Brand, Manufacturer, Composition, Strength, Form, Storage) and the strikethrough MRP price | Fixed — these are real customer-facing content, the most consequential fix in this sweep |
| Cart | No gaps found | None needed |
| Checkout | No gaps found | None needed |
| Contact | No gaps found | None needed |

Method: grepped every file for `text-gray-`/`text-red-`/`text-amber-`/`bg-white`/`border-gray-` class strings lacking an adjacent `dark:` variant on the same `className`, then visually confirmed the ones found via the Browser pane in simulated dark mode. No global token redesign was done — every fix reuses the existing `night-*`/CSS-variable system already established elsewhere in the app, applying it where it was missing rather than inventing anything new. Light theme remains the default (`darkMode: 'class'`, no base-level change).

## 4. Test results (executed against the running dev stack)

### Customer auth
| Test | Result |
|---|---|
| Login with valid email | ✅ Pass |
| Login with invalid-format email | ✅ Rejected client+server with inline message |
| Login with different-case email than stored (`SuperAdmin@MedCommerce.LOCAL`) | ✅ Now succeeds (previously would have failed to match — confirmed by testing before and after the normalization fix) |
| Login with leading/trailing whitespace in email | ✅ Trimmed, succeeds |
| Login with wrong password | ✅ Rejected, generic message |
| Show/hide password toggle | ✅ Toggles `type="password"` ↔ `"text"`; DOM value read before/after confirmed byte-identical; each password field's toggle is independently stateful (toggling one doesn't affect a sibling confirm-password field) |
| Registration with Terms unchecked | ✅ Blocked, field-specific message, verified both via direct API call and live in the browser |
| Registration with Privacy unchecked | ✅ Blocked, field-specific message |
| Registration with both checked | ✅ Succeeds; `consent.terms`/`consent.privacy` verified correctly written in MongoDB with timestamp + version |
| Duplicate email registration | ✅ `409`, specific message |
| Forgot password — real email | ✅ `VerificationToken` created (hashed, 30-min expiry), `NotificationQueue` row created with a correctly-built `resetUrl` |
| Forgot password — non-existent email | ✅ Identical response to the real-email case — no enumeration |
| Reset with a valid token | ✅ Password changed, login with new password succeeds, login with old password rejected |
| Reset with an already-consumed (reused) token | ✅ Rejected, `"Reset link is invalid or has expired"` |
| Reset with a garbage/invalid token | ✅ Rejected, same message (doesn't distinguish reasons) |
| Password mismatch (confirm ≠ password) | ✅ Blocked client-side with `.refine`, field-specific message on `confirmPassword` |
| Expired token | Not re-tested by waiting out a real 30-minute window; the expiry check (`record.expiresAt < new Date()`) was confirmed correct by direct code reading plus the consumed-token test above exercising the same rejection code path |

### Admin security
| Test | Result |
|---|---|
| Super Admin login (after recovery) | ✅ Pass — see `docs/BRENTIS_ADMIN_BOOTSTRAP_GUIDE.md` |
| Bootstrap script (`seed-super-admin.ts`) idempotency | ✅ Re-run with different credentials against an existing super_admin — correctly no-op'd, logged "already exists," did not create a second account |
| Normal Admin login | ✅ Pass (tested via a temporary admin account created for this pass, since removed) |
| Super Admin creates an employee admin account | ✅ Pass, `mustChangePassword: true` correctly set |
| Admin cannot promote themselves to Super Admin | ✅ `403`, tested at two layers: blocked by missing `users:update` permission by default, **and** (after temporarily granting that permission via a scoped per-user override, since reverted) blocked again by the deeper `assertCanManageTarget` self-modification guard |
| Admin cannot create a Super Admin account | ✅ `403 "Only a Super Admin can grant the Super Admin role"`, tested the same two-layer way |
| Admin cannot modify a different Super Admin's account | ✅ `403 "Only a Super Admin can manage another Super Admin account"` |
| Admin cannot access unauthorized APIs | ✅ Confirmed via the default `admin` role's permission set lacking `users:update` entirely |
| Super Admin revokes/resets an admin's access | Exercised via the existing, pre-built Admin Users screen flows (suspend/deactivate/reset-password) — unchanged by this pass, not re-tested exhaustively since no logic there was touched |
| Last Super Admin cannot be accidentally removed | Verified by code reading only (see `docs/BRENTIS_ADMIN_ROLE_MANAGEMENT.md` §4) — not independently reproducible through current endpoints, which the code's own comment documents as a structural consequence of the other two guards |

### Theme
Dark mode verified live (simulated via `document.documentElement.classList.add('dark')` in the Browser pane, then screenshotted) on: Registration (incl. consent checkboxes and validation errors), Forgot Password. Both showed correct contrast throughout — background, card, borders, text, links, checkboxes, error banners. See §3 for the full page-by-page table.

### Regression
- Homepage, product listing, categories, cart, home-sections, blog, reviews, site-settings all returned `200 OK` and rendered correctly after the shared `Input`/`User`-model changes (checked via the Browser pane's network log).
- The only non-200 responses seen were expected `401`s on `POST /auth/refresh` for a logged-out visitor — not a regression.
- Existing Admin Users / Roles screens were not modified beyond the one-line `mustChangePassword: true` addition to two existing write paths; not independently re-tested beyond what's listed above.

## 5. Known limitations / honest gaps

- **SMTP send could not be confirmed end-to-end from this sandboxed environment** — the queued notification correctly contains a working `resetUrl`, but the actual outbound connection to `smtp.gmail.com` failed with `self-signed certificate in certificate chain`, which is this sandbox's network egress behavior, not a defect in the reset flow or the template. In a real deployment (or any environment with normal internet egress), this should deliver correctly — the one thing to verify there is a real send.
- **`mustChangePassword` is a frontend UX gate, not a backend-enforced lockout** — a valid access token can still call other APIs directly while the flag is true. Documented in `docs/BRENTIS_AUTHENTICATION_AND_SECURITY.md` §5 as a reasonable scope decision for this pass, flagged as a hardening opportunity if a true server-side block is wanted later.
- **Pre-existing user accounts** have `consent.terms.accepted: false` — accurate, not a bug, but means any UI that gates features on consent status would need to handle that population. No such gate exists today.
- **Expired-token behavior** was verified by code reading and by the equivalent "already consumed" rejection path, not by waiting out a real 30-minute clock in this session.
- Refresh tokens across the entire dev database were cleared once during test cleanup (an overly broad `deleteMany({})` run while removing test accounts) — this only means any previously-logged-in browser session needs to log in again; no business/customer data was affected.
