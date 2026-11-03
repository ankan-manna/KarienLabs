# BRENTIS HEALTHCARE — Guest Cart Architecture Audit & Design

**Status:** Research and design only. No backend, frontend, or database code was modified in this prompt. Every finding below is sourced from reading the actual code and from a live, directly-reproduced reproduction of the bug (not assumed).

---

## 1. Current Cart Architecture (as it actually exists)

```
ProductCard.tsx "Add to cart" button
  → useCartMutations().add.mutate({ productId, quantity })      [apps/web/src/modules/storefront/hooks/useCart.ts]
    → addCartItem(productId, quantity, variantId)                [apps/web/src/api/cart.api.ts]
      → httpClient.post('/cart/items', {...})                    [apps/web/src/api/http-client.ts — axios instance]
        → request interceptor attaches `Authorization: Bearer <token>` ONLY IF an in-memory accessToken exists
        → request reaches Express: POST /api/v1/cart/items
          → cartRouter.use(requireAuth)  ⟵ BLANKET GATE, runs before EVERY cart route
            → requireAuth rejects if no `Bearer ` header present
```

No guest-cart mechanism exists anywhere in this flow today. The request simply fails before it ever reaches the controller.

## 2. Exact Reason for "Missing Bearer Token" (root cause, confirmed in two independent ways)

**Source-code confirmation** — `apps/api/src/modules/customers/cart.routes.ts`:
```ts
cartRouter.use(requireAuth);   // applies to EVERY route below, no exceptions
cartRouter.get('/', getMyCartHandler);
cartRouter.post('/items', validate(addCartItemSchema), addCartItemHandler);
// ...all other cart routes
```
`apps/api/src/middlewares/auth.middleware.ts`:
```ts
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthenticatedError('Missing bearer token'));   // ⟵ the exact string
  }
  // ...
}
```

**Live reproduction** — a direct `fetch('/api/v1/cart', { credentials: 'include' })` from a genuinely cookie-less, never-logged-in browser tab returned:
```json
{"success":false,"data":null,"error":{"code":"UNAUTHENTICATED","message":"Missing bearer token"}}
```
HTTP 401. Exact match to both the user's report and the source.

**On the frontend side**, `apps/web/src/modules/storefront/hooks/useCart.ts` shows the asymmetry that causes this to surface as a *silent* failure path rather than being prevented:
- `useCart()` (the cart *read* query) is `enabled: isAuthenticated` — correctly guarded, never fires for a guest.
- `useCartMutations().add` (the *write* mutation) has **no such guard at all** — it fires unconditionally on button click regardless of auth state, hits the unguarded backend route, and the only thing the guest sees is a generic `toast.error(err.message)` reading "Missing bearer token" — a raw backend error string leaking to the UI with no guest-friendly framing.

## 3. Affected Files

**Frontend:**
- `apps/web/src/modules/storefront/components/ProductCard.tsx` (Add to Cart / Buy Now buttons — no auth check before calling the mutation)
- `apps/web/src/modules/storefront/pages/ProductDetailPage.tsx` (same pattern, PDP's own Add to Cart/Buy Now)
- `apps/web/src/modules/storefront/hooks/useCart.ts` (the mutations with no guest path)
- `apps/web/src/api/cart.api.ts`, `apps/web/src/api/http-client.ts` (would need to carry a guest identifier once one exists — see §8)

**Backend:**
- `apps/api/src/modules/customers/cart.routes.ts` (`cartRouter.use(requireAuth)`)
- `apps/api/src/modules/customers/cart.controller.ts` (every handler assumes `req.user!.id` is present — non-null assertion)
- `apps/api/src/modules/customers/cart.service.ts` (every function signature takes `userId: string` as a required parameter, queries exclusively by `{ userId }`)
- `apps/api/src/modules/customers/models/cart.model.ts` (schema already has an unused `sessionId` field — see §4)
- `apps/api/src/middlewares/auth.middleware.ts` (`requireAuth` vs. the already-existing, already-proven `optionalAuth` — see §5)

## 4. A Major Finding: Guest-Cart Support Was Already Designed Into the Schema, Then Never Finished

`apps/api/src/modules/customers/models/cart.model.ts`:
```ts
/** One doc per user (or guest sessionId) with embedded items — matches how a cart is always read/written as a whole. */
const cartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },   // NOT required
  sessionId: { type: String, default: null, index: true },                // indexed, but...
  items: [...],
  couponCode: { type: String, default: null },
}, { timestamps: true });

cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // abandon guest carts after 30d
```
`grep -n "sessionId" cart.service.ts cart.controller.ts` → **zero matches.** The field exists, is indexed, and has a comment explicitly describing guest-cart abandonment — but it is never read or written anywhere in the service or controller layer. **This strongly indicates guest-cart support was planned at the data-model level and never completed at the API level** — this design should be finished, not replaced with something new.

## 5. A Second Major Finding: The Reusable Pattern Already Exists

`apps/api/src/middlewares/auth.middleware.ts` already defines, and other routes already use, an `optionalAuth` middleware:
```ts
/** ...attaches `req.user` when a valid Bearer token is present, otherwise leaves it
 * undefined and continues. For endpoints that are genuinely public but behave
 * better with identity when it's available... */
export function optionalAuth(req, _res, next) { /* never rejects */ }
```
This is the **exact** pattern guest-cart routes need (identity-if-present, never-reject) and it is already a proven, in-production pattern elsewhere in this codebase (e.g. `/feature-flags/active`). The recommendation below reuses it rather than inventing a new auth mode.

## 6. Checkout/Order Authentication — Confirmed Genuinely Required, Not Just Legacy

`apps/api/src/modules/orders/order.routes.ts`: `orderRouter.use(requireAuth)`. Order placement is tied to `userId`-scoped addresses, invoices, and order history throughout this codebase (confirmed in the prior workflow's architecture analysis). **This requirement is real and should not be removed** — it directly satisfies the brief's own instruction ("authenticate only if the existing secure order-placement architecture genuinely requires it" — it does). The existing frontend already reflects this correctly: `/checkout` is wrapped in `ProtectedRoute`.

## 7. Security Posture Already in Place (reusable, not something to rebuild)

- **Price is never trusted from the client.** `cart.service.ts`'s `addCartItem` always re-reads `product.basePrice` from a fresh DB lookup; the client only ever sends `productId`/`quantity`/`variantId`. This applies unchanged to a guest cart.
- **Input validation already exists and is adequate**: `cart.validator.ts`'s `addCartItemSchema` requires a valid Mongo ObjectId for `productId` and bounds `quantity` to `1–100`. No change needed.
- **`cookie-parser` is already installed and used** (for the existing httpOnly refresh-token cookie) — a precedent for issuing a second, similarly-handled httpOnly cookie for the guest cart identifier, rather than introducing a new storage mechanism (e.g. raw localStorage, which would be a regression from the existing "never put tokens in localStorage" security posture already documented in `http-client.ts`).

## 8. Recommended Guest-Cart Design

### 8.1 Identity: a server-issued, httpOnly, signed guest-cart cookie
- On the **first** cart-mutating request from a client with no `Authorization` header and no existing guest cookie, the server generates a cryptographically random ID (`crypto.randomUUID()` or equivalent — never client-supplied, preventing cart-ID guessing/hijacking) and sets it as an httpOnly, `SameSite=Lax`, signed cookie (reusing the existing `cookie-parser` + its secret, same pattern as the refresh-token cookie).
- This value becomes `sessionId` on the Cart document — the field the schema already has.
- Because it's httpOnly, it survives page refreshes automatically (satisfies "refreshes the website without losing the cart") without any new frontend storage code.

### 8.2 Route changes — minimal, reuses an existing middleware
```ts
// cart.routes.ts
cartRouter.use(optionalAuth);   // was: requireAuth
```
Every handler then resolves an "owner key" instead of assuming `req.user.id`:
```ts
function resolveCartOwner(req: Request): { userId: string } | { sessionId: string } {
  if (req.user) return { userId: req.user.id };
  // sessionId comes from the signed cookie set in §8.1 (middleware reads/sets it)
  return { sessionId: req.guestCartId! };
}
```
`cart.service.ts`'s functions change their first parameter from `userId: string` to this owner-key union, and every `CartModel.findOne({ userId })` / `updateOne({ userId }, ...)` becomes `findOne(ownerQuery)` / `updateOne(ownerQuery, ...)` where `ownerQuery` is `{ userId }` or `{ sessionId }` accordingly. This is a mechanical, well-contained change — the query shape doesn't otherwise change, and every existing security check (product re-validation, price re-fetch, quantity bounds) is untouched.

### 8.3 Guest-to-user cart merge (on login/register success)
```
On successful login/register:
  1. Read the guest sessionId cookie, if present.
  2. If no guest cart exists for that sessionId → nothing to merge, proceed normally.
  3. Fetch the user's existing cart (if any) and the guest cart.
  4. For each guest item:
       - If the SAME productId+variantId already exists in the user's cart → sum quantities (capped at 100, the existing validator's max).
       - Else → append it, but FIRST re-validate: product still active? price re-fetched fresh (never trust the guest cart's stored priceAtAdd)? Skip + collect into an "unavailable items" list if the product was deactivated/deleted since it was added.
  5. Save the merged user cart.
  6. Delete the guest cart document (not just clear it — remove it entirely, since sessionId carts are meant to be ephemeral).
  7. Clear the guest cookie.
  8. Only after all of 3–7 succeed does the response report success — if the merge throws partway through, the guest cart is left untouched and the login itself still succeeds (merging is an enhancement to login, never a blocking precondition for it).
```
This directly satisfies every sub-requirement in the brief's §8 (merge, no duplicates, preserve quantities, revalidate inventory/price, handle unavailable products, clear only after success, never lose the cart on failure).

### 8.4 Frontend changes (minimal)
- `useCart()`'s query should change from `enabled: isAuthenticated` to `enabled: true` (always fetch — the backend now resolves the cart for guests too via the cookie).
- `useCartMutations()` needs no auth-gating logic added — it already always fires; the backend now simply succeeds instead of 401ing.
- `withCredentials: true` is already set on the shared `httpClient` instance — the new guest cookie rides along automatically, no new frontend cookie-handling code needed.
- `CartPage.tsx`/`Header.tsx`'s cart badge already read from `useCart()` — no changes needed beyond the `enabled` flag above.

### 8.5 What does NOT change
- `requireAuth` itself: untouched, still used by `orderRouter`, `addressRouter`, and every other genuinely-authenticated route.
- Checkout flow, Razorpay integration, payment verification: **completely untouched** — a guest still must log in/register at the `/checkout` `ProtectedRoute` boundary, exactly as today, with their cart merging in automatically at that point per §8.3.
- Admin consumers of the cart API (if any — none were found; cart is a customer-only concept in this codebase) are unaffected since the change is additive (optionalAuth still honors a real Bearer token exactly as before).

## 9. Architecture Diagram

```mermaid
sequenceDiagram
    participant G as Guest Browser
    participant API as Express API
    participant DB as MongoDB (Cart)

    G->>API: POST /cart/items (no Authorization header)
    Note over API: optionalAuth — no token, continues anonymously
    alt no guest cookie yet
        API->>API: generate signed, httpOnly sessionId cookie
    end
    API->>DB: findOrCreateCartDoc({ sessionId })
    DB-->>API: cart doc
    API->>DB: upsert item (re-fetches real product price)
    API-->>G: 200 OK + Set-Cookie (guest id) + cart

    Note over G: Guest later logs in
    G->>API: POST /auth/login (cookie: guest sessionId)
    API->>DB: find cart by sessionId
    API->>DB: find/create cart by userId
    API->>API: merge items (revalidate price/inventory, dedupe)
    API->>DB: save merged user cart; delete guest cart doc
    API-->>G: 200 OK, clears guest cookie, returns access token

    Note over G: Checkout still requires real auth
    G->>API: POST /orders (Authorization: Bearer <token>)
    Note over API: requireAuth — unchanged, still mandatory here
    API-->>G: order created
```

## 10. Required Database Changes

**None are schema-breaking.** The `sessionId` field and its index already exist (added but unused). No migration is required for existing data — existing user carts (keyed by `userId`) are entirely unaffected by adding guest-cart read/write paths that key by `sessionId` instead. This is additive, not a schema change.

## 11. Required API Changes

| Change | Type | Backward compatible? |
|---|---|---|
| `cartRouter.use(optionalAuth)` instead of `requireAuth` | Middleware swap | **Yes** — any request that already carries a valid Bearer token behaves identically; only previously-rejected, token-less requests now succeed |
| `cart.service.ts` functions accept an owner-key union instead of a bare `userId` | Internal refactor | **Yes** — not part of the public API contract; response shapes (`Cart`) are unchanged |
| New: guest-cart cookie issuance in cart middleware/controller | New behavior | **Yes** — additive `Set-Cookie`, no existing client depends on its absence |
| New: cart-merge step in the login/register controller | New behavior | **Yes** — login/register responses already return a cart-unrelated payload (tokens/user); adding a merge side-effect doesn't change that contract. Should be implemented so a merge failure never blocks login itself (§8.3 step 8). |

## 12. Backward Compatibility

- Logged-in customer behavior is unchanged end-to-end — same routes, same responses, same `userId`-keyed cart.
- Admin: cart is not an admin-consumed resource anywhere in this codebase (confirmed in the prior workflow's dependency map) — zero admin impact.
- Existing abandoned-cart TTL behavior (`expireAfterSeconds` on `updatedAt`) already applies correctly to guest carts too, since it's not keyed to `userId` at all.

## 13. Test Cases (for Prompt 2's implementation to validate against)

| # | Scenario | Expected result |
|---|---|---|
| 1 | Guest adds a product to cart, no account | 200 OK, item added, guest cookie set |
| 2 | Guest refreshes the page | Cart persists (cookie survives reload) |
| 3 | Guest updates quantity / removes an item | Succeeds, same guest cart |
| 4 | Guest with an empty cart navigates to `/checkout` | Redirected to login (unchanged `ProtectedRoute` behavior) |
| 5 | Guest with items logs in, no prior account cart | Guest cart becomes the account's cart, guest cookie cleared |
| 6 | Guest with items logs in, account **already has a different item** in its cart | Both items present post-merge, no duplicates |
| 7 | Guest with items logs in, account **already has the same item** (same product+variant) | Quantities summed, capped at the existing max (100) |
| 8 | Guest cart contains a product that was deactivated before login | Merge succeeds for other items; deactivated item reported as unavailable, not silently dropped without explanation |
| 9 | Guest attempts to call `POST /orders` directly (no token) | Still 401 — `requireAuth` on `orderRouter` is untouched |
| 10 | A malicious client sends a forged/guessed `sessionId` cookie value | Signed-cookie verification fails → treated as no cookie → a fresh one is issued; cannot access another guest's cart |
| 11 | Logged-in user with a valid Bearer token | Identical behavior to today — zero regression |

## 14. Risks and Migration Strategy

- **Risk:** forgetting to re-fetch price/availability during merge could let a stale guest-cart price slip through. **Mitigation:** merge reuses the exact same `ProductModel.findOne({ isActive: true })` + `product.basePrice` pattern `addCartItem` already uses — no new price-trust surface.
- **Risk:** guest carts accumulating indefinitely in the database. **Mitigation:** already handled — the existing 30-day TTL index on `updatedAt` applies to every cart document regardless of whether it's `userId`- or `sessionId`-keyed.
- **Risk:** cookie-consent/privacy implications of setting a cookie for anonymous visitors. **Note for the business:** an httpOnly functional cookie for cart persistence is standard practice and distinct from tracking cookies, but if this project has a cookie-consent banner requirement, this should be classified as "strictly necessary" rather than requiring opt-in — flagged for the business/legal review, not decided unilaterally here.
- **Migration:** none required — purely additive. No existing data needs to be touched, backfilled, or migrated.

---

*Companion documents: [`BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md`](./BRENTIS_REFERENCE_MATCH_IMPLEMENTATION_PLAN.md) §L for the execution-ready task breakdown.*
