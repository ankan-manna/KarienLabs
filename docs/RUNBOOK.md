# MedCommerce — Local Setup, Testing & Operations Runbook

This is an executable runbook for running the **actual MedCommerce codebase**
(this repository, as it exists today) entirely on a local machine — **no AWS
account required**. Every command, path, port, and environment variable below
was read directly out of the repository (docker-compose files, `env.schema.ts`,
route files, package.json scripts) — nothing here is aspirational.

## How this document was verified

Be precise about what "verified" means for each section, per this
document's own honesty rule — steps are marked one of:

- **VERIFIED (this session)** — actually executed and the output is described.
- **CODE-VERIFIED** — the exact file/line was read and the described behavior
  is what the code does; not executed end-to-end in this session.
- **NOT TESTED — EXTERNAL CREDENTIAL REQUIRED** — needs a real Razorpay/
  Cloudinary/Shiprocket/Google account this environment doesn't have.
- **NOT TESTED — DOCKER REQUIRED** — Docker Desktop's daemon was not
  reachable in the sandbox this runbook was authored in (`docker info`
  failed to connect to the daemon socket). The `docker-compose.dev.yml`
  MinIO service was implemented and code-reviewed but not started. As a
  substitute, the underlying S3 client code path (the part this runbook
  needed to prove out — `AWS_S3_ENDPOINT` + path-style addressing) **was**
  verified end-to-end in this session using `s3rver` (an npm-installable,
  Docker-free, path-style S3-compatible server — same protocol MinIO
  speaks), against the real `s3.client.ts` / `storage.service.ts` code:
  upload → existence check → presigned URL → byte-exact download → delete
  all passed. **Run one real `docker compose up` smoke test yourself
  (Step 5) before trusting this in anger** — the code path is proven, the
  specific container images have not been pulled/started here.

---

## 0. Architecture (as implemented)

```
Docker Desktop
│
├── MongoDB (mongo:7, replica set "rs0" — required, Mongoose transactions
│   are used for checkout/inventory — see order.service.ts)
├── Redis (redis:7-alpine — rate limiting, permission cache, BullMQ queues)
├── MinIO (local dev only — S3-compatible object storage)
│   ├── invoices/{sellerId}/{yyyy}/{mm}/{invoiceId}.pdf
│   ├── shipping-labels/{sellerId}/{yyyy}/{mm}/{shipmentId}.pdf
│   ├── return-labels/{sellerId}/{yyyy}/{mm}/{returnId}.pdf
│   ├── prescriptions/{customerId}/{yyyy}/{mm}/{prescriptionId}/{file}
│   └── logs/{category}/{yyyy}/{mm}/{dd}/{instanceId}/{file}.log.gz
├── API (Express, apps/api — port 5000)
├── Worker (BullMQ consumer, apps/api/src/worker.ts — notifications, log
│   archival/retention, Shiprocket sync, etc.)
└── Web (React/Vite, apps/web — port 5173 dev / port 80 via nginx in prod)
```

One bucket, not several — the existing storage abstraction
(`apps/api/src/integrations/s3/storage.util.ts::buildDocumentObjectKey` /
`buildLogObjectKey`) partitions everything by **key prefix**, not by
bucket. This runbook follows that design rather than inventing new buckets.

Cloudinary remains completely separate and unchanged — it's what actually
serves product/catalog images (`apps/api/src/integrations/cloudinary/*`);
MinIO/S3 never touches product images.

---

## 1. Prerequisites

- Docker Desktop (for MongoDB, Redis, MinIO, and optionally the full
  containerized stack)
- Node.js >= 20 and npm 10.x (`engines` in root `package.json`)
- A Razorpay account in **Test Mode** (free to create, no live business
  verification needed for test keys)
- Optional: a Cloudinary account (free tier) for product images — the app
  runs without it, but product image upload will not work
- Optional: a Shiprocket account, a Google Cloud OAuth client, an SMTP
  relay (Gmail app password, Mailtrap, etc.) — every one of these is
  independently self-disabling; the app boots and the rest of it works
  with all of them empty

No AWS account, anywhere in this document.

---

## 2. Repository facts this runbook relies on

Read directly from the repo (not invented):

| Fact | Source |
|---|---|
| Backend port | `5000` — `.env.example` `PORT`, `apps/api/Dockerfile` `EXPOSE 5000` |
| Frontend dev port | `5173` — `apps/web/vite.config.ts` |
| MongoDB needs a replica set | `docker-compose.yml`'s `mongo` service runs `--replSet rs0`; checkout/inventory use Mongoose transactions (`order.service.ts`) which require one |
| Redis is a hard dependency | `globalRateLimiter` (`rate-limit.middleware.ts`) uses `RedisStore` for every `/api/v1` request |
| API routes are mounted at | `/api/v1/*` (`apps/api/src/routes/index.ts`) |
| Health endpoints | `GET /health`, `GET /health/live`, `GET /health/ready` (`apps/api/src/routes/health.routes.ts`) |
| Vite dev proxy | `/api/*` → `http://localhost:5000` (`apps/web/vite.config.ts`) — no `VITE_API_BASE_URL` needed for local dev |
| Seed scripts (complete list) | `seed:roles`, `seed:feature-flags`, `seed:dynamic-menu`, `verify:models`, `migrate:seller-backfill`, `migrate:google-id-null`, plus **`seed:super-admin`** added by this runbook (Step 7) — `apps/api/package.json` |
| S3/MinIO storage is self-disabling | `apps/api/src/integrations/s3/s3.client.ts::isS3Configured()` — invoice/label uploads fall back to Cloudinary when unset (`document-storage.helper.ts`) |

---

## 3. Local Docker environment — what was implemented

Before this runbook, `infra/docker/docker-compose.yml` had MongoDB and
Redis; there was **no MinIO service** — the repo's committed
`.env`/`.env.example` had stray personal shell notes referencing a
one-off `s3rver` invocation instead of real infrastructure. This runbook
implements the missing piece:

**Added to `infra/docker/docker-compose.dev.yml`** (local-dev overlay only
— production/staging keep using real AWS S3, see Step 33):

- `minio` service — `minio/minio` image, persistent named volume
  (`minio-data`), ports `9000` (S3 API) and `9001` (web console),
  credentials from `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` env vars (no
  hardcoded secrets), `restart: unless-stopped`, a real `HEALTHCHECK`
  against `/minio/health/live`, attached to the existing `medcommerce`
  Docker network.
- `minio-init` service — one-shot `minio/mc` container that runs
  `mc mb --ignore-existing` to create the bucket automatically on every
  `docker compose up` (idempotent — never errors on a bucket that already
  exists). `api`/`worker` now `depends_on: minio-init` (`condition:
  service_completed_successfully`), so the bucket always exists before the
  app's first request.

**Adapted the existing S3 abstraction** (`apps/api/src/integrations/s3/`)
rather than writing a second storage system:

- `packages/shared/src/schemas/env.schema.ts` — added one new var,
  `AWS_S3_ENDPOINT` (optional, empty by default).
- `apps/api/src/integrations/s3/s3.client.ts` — `getS3Client()` now passes
  `endpoint` + `forcePathStyle: true` to the AWS SDK's `S3Client`
  constructor **only when `AWS_S3_ENDPOINT` is set**; production (where
  it's empty) is byte-for-byte unchanged. No business logic
  (`storage.service.ts`, `document-storage.helper.ts`, invoice/label/log
  code) was touched — they call the same functions regardless of which
  provider is behind them.

This is the *entire* diff needed to make the existing S3 code work against
MinIO: one env var, one conditional in the client constructor.

---

## 4. MinIO S3 configuration — how switching providers works

| | LOCAL (MinIO) | PRODUCTION (AWS S3) |
|---|---|---|
| `AWS_S3_ENDPOINT` | `http://minio:9000` | *(empty)* |
| `AWS_REGION` | `us-east-1` (MinIO ignores the value but the SDK requires a non-empty string) | real AWS region |
| `AWS_ACCESS_KEY_ID` | `minioadmin` (= `MINIO_ROOT_USER`) | real IAM access key |
| `AWS_SECRET_ACCESS_KEY` | `minioadmin123` (= `MINIO_ROOT_PASSWORD`) | real IAM secret |
| `AWS_S3_BUCKET` | `medcommerce-local` | real production bucket name |

Switching providers is **purely a `.env` change** — no code path, deploy
script, or business-logic branch differs between the two. Super Admin can
also override these at runtime via the `s3` Configuration namespace
(`Configuration` page in the admin panel — same DB-first-then-env pattern
every other integration in this codebase uses).

---

## 5. Starting the local stack

### 5a. Docker-based (recommended — matches production topology)

```bash
cd /Users/ankan/Desktop/medweb
cp .env.example .env   # then fill in Razorpay test keys, Cloudinary, etc.
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env up -d
```

This starts, in dependency order: `mongo` → `mongo-init-replica` (initiates
the replica set once) → `redis` → `minio` → `minio-init` (creates the
bucket) → `api` (tsx watch, hot reload) → `worker` → `web` (Vite dev
server) → `mongo-express` (a Mongo admin UI at `:8081`, dev convenience,
not part of the app).

**NOT TESTED — DOCKER REQUIRED** in this authoring session (see the note
at the top of this document). Config was validated with
`docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml config`
mentally against the Compose spec's merge rules (`depends_on` and
`volumes` are additive across `-f` files, not replaced) — run that command
yourself first if you want to see the fully merged config before `up`.

```bash
# Status / health
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml ps
curl http://localhost:5000/health/ready
curl http://localhost:9000/minio/health/live

# Logs (any service)
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml logs -f api
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml logs -f minio

# Restart one service
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml restart api

# Stop (keeps volumes/data)
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml stop
```

**Required one-time host setup for MinIO presigned URLs** — read this
before testing invoice downloads: the API container reaches MinIO at the
Docker-internal hostname `minio:9000` (`AWS_S3_ENDPOINT` above), and that
same hostname gets baked into every presigned download/upload URL
(`getPresignedDownloadUrl`/`getPresignedUploadUrl` in `storage.service.ts`
sign against whatever host the S3 client was built with). Your browser,
running on the host machine and not in the Docker network, cannot resolve
`minio` unless you tell it to. Fix once:

```bash
echo "127.0.0.1 minio" | sudo tee -a /etc/hosts
```

Since `docker-compose.dev.yml` also publishes MinIO's port 9000 to the
host, `http://minio:9000/...` now resolves correctly from your browser
too, and the presigned signature (which is computed over the exact host in
the URL) matches. Without this, invoice/label downloads clicked from the
admin UI will fail to resolve.

### 5b. Non-Docker (what this session actually ran and verified)

If Docker's daemon isn't available, everything except MongoDB/Redis/MinIO
can run as plain Node processes, pointed at externally-hosted or
locally-installed Mongo/Redis, with `s3rver` standing in for MinIO
(same S3-compatible-endpoint mechanism, zero code difference):

```bash
# one-time
npm install
npm run build --workspace=@medcommerce/shared

# S3-compatible storage, no Docker
mkdir -p /tmp/s3data/medcommerce-local
npx s3rver -d /tmp/s3data -p 4568 --address 0.0.0.0

# apps/api/.env: set AWS_REGION=us-east-1, AWS_ACCESS_KEY_ID=S3RVER,
# AWS_SECRET_ACCESS_KEY=S3RVER, AWS_S3_BUCKET=medcommerce-local,
# AWS_S3_ENDPOINT=http://localhost:4568 (all on localhost — no
# Docker-hostname presigned-URL gotcha in this mode)

npm run dev --workspace=@medcommerce/api      # http://localhost:5000
npm run dev:worker --workspace=@medcommerce/api
npm run dev --workspace=@medcommerce/web      # http://localhost:5173
```

**VERIFIED (this session)** — with `s3rver` running exactly as above and
`AWS_S3_ENDPOINT=http://localhost:4568`, a driver script imported the real
`uploadDocument`/`getPresignedDownloadUrl`/`objectExists`/`deleteObject`
from `storage.service.ts` and confirmed: `isS3Configured() → true`,
`verifyBucketAccess() → true`, upload succeeded, the object existed
immediately after, the presigned URL's host/path were correctly
path-style (`localhost:4568/medcommerce-local/invoices/...`), the
downloaded bytes matched the uploaded buffer exactly, and the object was
gone after `deleteObject`. This proves the `AWS_S3_ENDPOINT` +
`forcePathStyle` mechanism this runbook depends on for MinIO actually
works against a real path-style S3-compatible server.

MongoDB still needs a replica set even outside Docker — either point
`MONGO_URI` at a free MongoDB Atlas cluster (works out of the box, replica
set already enabled) or run `mongod --replSet rs0` locally and initiate it
once with `mongosh --eval 'rs.initiate()'`. Redis: `brew install redis &&
brew services start redis`, or any reachable Redis instance.

---

## 6. Environment variables

Legend: **L** = safe local/test placeholder value, blank means "leave
empty to keep that integration self-disabled." Full templates:
`.env.example` (local), `.env.staging.example`, `.env.production.example`.

| Variable | Required | Purpose | Local/Test value | Where to obtain |
|---|---|---|---|---|
| `MONGO_URI` | Yes | Primary datastore | `mongodb://mongo:27017/medcommerce?replicaSet=rs0` (Docker) | n/a — Docker-provided |
| `REDIS_URL` | Yes | Rate limiting, RBAC/permission cache, BullMQ queues | `redis://redis:6379` (Docker) | n/a — Docker-provided |
| `JWT_ACCESS_SECRET` | Yes | Access-token signing (min 32 chars) | any 32+ char string | `openssl rand -base64 32` |
| `CONFIG_ENCRYPTION_KEY` | No (warns if unset) | Encrypts secrets saved via the admin Configuration UI at rest | 32-byte base64 | `openssl rand -base64 32` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | No | Product/catalog image storage (Step 12) | *(blank until you have an account)* | Cloudinary Dashboard → Account Details |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | No | Checkout payment capture | `rzp_test_...` | Razorpay Dashboard → Test Mode → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | No | Verifies `/api/v1/webhooks/razorpay` HMAC signature | any string, must match the dashboard's webhook config | Razorpay Dashboard → Webhooks |
| `SMTP_HOST`/`_PORT`/`_USER`/`_PASS`/`_FROM` | No | Email notifications (OTP, order, etc.) — SMS/WhatsApp/push are log-only stubs, no real provider wired | Gmail app-password or Mailtrap sandbox | Your provider |
| `GOOGLE_CLIENT_ID`/`_SECRET`/`_CALLBACK_URL` | No | Admin "Continue with Google" | *(blank = feature off)* | Google Cloud Console → OAuth Client |
| `SHIPROCKET_EMAIL`/`_PASSWORD`/`_PICKUP_LOCATION`/`_WEBHOOK_TOKEN` | No | Courier integration — **no sandbox mode exists in the code**, `SHIPROCKET_BASE_URL` always points at the live API | *(blank = feature off)* | Shiprocket account |
| `AWS_REGION`/`_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`/`_S3_BUCKET` | No | Invoice/label/log storage | `us-east-1` / `minioadmin` / `minioadmin123` / `medcommerce-local` | MinIO — see Step 5 |
| `AWS_S3_ENDPOINT` | No | S3-compatible endpoint override — **the only local-vs-prod difference** | `http://minio:9000` | n/a — Docker-provided |
| `MINIO_ROOT_USER`/`_ROOT_PASSWORD` | Docker-only | MinIO container credentials, must match `AWS_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY` above | `minioadmin` / `minioadmin123` | n/a |
| `SUPER_ADMIN_EMAIL`/`_PASSWORD`/`_NAME` | Script-only | Input to `npm run seed:super-admin` (Step 7) — not read by the server | see Step 7 | You choose |
| `LOG_LEVEL` | No | pino log verbosity | `info` | n/a |
| `RATE_LIMIT_WINDOW_MS`/`_MAX` | No | Global rate limiter | `60000` / `100` | n/a |

**NEVER commit a filled-in `.env`.** The three template files
(`.env.example`, `.env.staging.example`, `.env.production.example`)
clearly separate LOCAL / STAGING / PRODUCTION — staging and production
must use different `CONFIG_ENCRYPTION_KEY`s, different Razorpay
credentials, and real (non-`minioadmin`) secrets.

---

## 7. Create the Super Admin

**Real, verified fact about this codebase**: there is **no** existing
bootstrap mechanism. `POST /api/v1/auth/register` always creates a
`customer` role account (`auth.service.ts`), and every admin-creation
endpoint (`rbacAdminRouter POST /admin/rbac/users` →
`admin-user.service.ts::createAdminUser`) requires an **already
authenticated `super_admin` actor** — a deliberate anti-privilege-escalation
guard (`assertCanAssignRole`), not an oversight. Something has to create
the very first one directly against the database.

This runbook adds that missing piece: `apps/api/src/scripts/seed-super-admin.ts`
(`npm run seed:super-admin`, mirrors the existing `seed-roles.ts` script
pattern — a plain idempotent script, never an HTTP endpoint). It:

- refuses to run without `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` set
- validates the password against the same `passwordSchema` the admin-user
  API route enforces (upper+lower+digit, 8-128 chars)
- is a safe no-op if a `super_admin` already exists (never creates a second one)
- refuses to silently overwrite an existing account at that email

```bash
# 1. Seed the RBAC roles first (super_admin/admin/inventory_manager/customer)
npm run seed:roles --workspace=@medcommerce/api

# 2. Set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME in .env,
#    then create the account
npm run seed:super-admin --workspace=@medcommerce/api
```

**CODE-VERIFIED, not executed against a live DB in this session** (no
reachable MongoDB in the sandbox) — the script was written, and
`npx tsc --noEmit` passes clean for it as part of the full `apps/api`
typecheck.

**Login**: `POST /api/v1/auth/login` with `{email, password}` from a
browser at `http://localhost:5173/login`.

- **OTP**: **off by default** (`DEFAULT_AUTH_CONFIG.otpEnabled = false` in
  `auth-config.service.ts`) — a fresh install logs in with just
  email+password. Super Admin can turn OTP-on-login on later via
  Configuration → Authentication.
- **Google login**: only appears/works once `GOOGLE_CLIENT_ID`/`_SECRET`
  are set **and** `authentication.googleAdminLoginEnabled` is flipped on
  in the Configuration page — both are required (env vars alone are not
  enough).
- **Password reset**: `POST /api/v1/auth/forgot-password` →
  emailed/OTP-delivered reset code → `POST /api/v1/auth/reset-password`.
  Requires SMTP configured to actually receive the email — **NOT TESTED —
  EXTERNAL CREDENTIAL REQUIRED** without a real SMTP relay.

Change `SUPER_ADMIN_PASSWORD` immediately after first login via the
account's own profile settings — it was typed into a `.env` file.

---

## 8. Create a Platform Admin

```
Super Admin logs in
  → /admin/super/users  (rbac-admin.routes.ts: GET/POST /admin/rbac/users)
  → "Create Admin User" — name, email, password, role (e.g. "admin")
  → /admin/super/roles  (PUT /admin/rbac/roles/:key/permissions) to adjust
    that role's permission set, or
  → /admin/rbac/users/:userId/permissions (POST) to grant/deny a single
    permission override for just that one user
  → Configuration → toggle any module namespace off (e.g. `prescription`)
  → Save
  → Log out, log in as the new Platform Admin
  → Verify: modules you disabled are both hidden in the sidebar AND
    return 403 if hit directly (see Step 29's IDOR/authorization tests)
```

- **super_admin protection is real, not just UI hiding**: attempting to
  create/promote/suspend a `super_admin`-role account, or attempting to
  create a role whose `key` is `super_admin`, as a non-`super_admin`
  actor is rejected server-side (`assertCanAssignRole`/
  `assertCanManageTarget` in `admin-user.service.ts`) — this is
  CODE-VERIFIED by reading the guard functions directly; it was also
  covered by this codebase's own automated integration test suite
  (`rbac-privilege-escalation.integration.test.ts`, part of `npm run
  test:integration`, which passed as of the last full run of this
  repository's test suite).
- **Disabled-module enforcement**: every gated module (prescriptions,
  coupons, returns, ...) exposes its own `Get Config`/`isXEnabled()`
  check, called from **both** the controller/service layer (backend
  block) and the same config the frontend fetches to decide what to
  render (UI hide) — see `prescription-config.service.ts` for the
  canonical example. **NOT TESTED end-to-end in a browser this session**
  — CODE-VERIFIED by reading the enforcement points.

---

## 9. Create a Customer

```
POST /api/v1/auth/register  {name, email, password, phone?}
  → role is always ROLES.CUSTOMER (auth.service.ts) — cannot self-register
    as any other role, by design
POST /api/v1/auth/login     {email, password}
  → OTP challenge only if Super Admin has turned it on (Step 7)
POST /api/v1/auth/forgot-password → /reset-password  (needs SMTP — see Step 6)
Google login for customers: NOT IMPLEMENTED — Google OAuth in this
  codebase is scoped to admin login only (Prompt 10's own comment in
  .env.example: "Admin 'Continue with Google'"); there is no customer-facing
  Google login route.
GET/PATCH /api/v1/profile/me         — profile
GET/POST/PATCH/DELETE /api/v1/addresses — saved addresses
```

**NOT TESTED against a live server this session** (no reachable Mongo/API
in the sandbox) — CODE-VERIFIED via the route/service files above.

---

## 10. First admin configuration sequence (recommended order)

Based on the actual modules present in `/admin/super/configuration` and
the admin panel's module pages (do this in order — later steps assume
earlier ones exist):

1. **Roles & permissions** (`/admin/super/roles`) — review the seeded
   `admin`/`inventory_manager` role permission sets, adjust if needed.
2. **Categories** (`/admin/catalog/categories`) — at least one category
   before products can be created.
3. **Brands / Manufacturers** — optional but referenced by Product.
4. **Tax (GST)** (`/admin/tax`) — add at least one HSN code + GST rate
   (`GstSettingModel`) before creating a taxable product.
5. **Shipping** (`/admin/delivery`) — at least one `ShippingZone` +
   `ShippingRule` (with a `freeShippingThreshold` if desired) — checkout
   fee calculation returns 0 with none configured, not an error.
6. **Payment** — Razorpay test keys (Step 13).
7. **Storage** — confirm S3/MinIO is reachable (Step 5), or leave it
   blank to keep the pre-existing Cloudinary invoice fallback.
8. **Notifications** — SMTP if you want real emails; otherwise
   notifications still queue/log, they just won't deliver.
9. **Coupons** (`/admin/super/coupon-settings`) — module is on by default;
   create your first coupon after at least one product exists (Step 11).
10. **SEO** (`/admin/super/seo-settings`) — optional, affects storefront
    metadata only.
11. **Products** (Step 11) — last, since it depends on categories/tax/brand.

---

## 11. Product test

```
Admin → Catalog → Categories → Create Category
  → Admin → Catalog → Products → Create Product
    → name, description, category, brand?, HSN/gstRate (Step 10.4)
    → Upload product image (Cloudinary direct upload — see Step 12)
    → Set price
    → GST rate (from the HSN mapping, or override per-product)
    → Inventory: create a Warehouse (if none) → add a Batch with
      quantityAvailable (inventory is batch/FEFO-based, not a flat
      "stock count" field — see product.gstRate/medicine fields)
    → medicine.prescriptionRequired: true/false (Step 24) — falls back to
      the product's Category.requiresPrescriptionDefault if left unset
    → Publish (isActive: true)
  → Verify customer-facing: GET /api/v1/products (public) or
    http://localhost:5173/products/:id
```

**Bulk Excel upload**: implemented —
`POST /api/v1/products/import` and `GET /api/v1/products/export/excel`
(`product.routes.ts`, both behind `exportImportRateLimiter`). Uses
`apps/api/src/utils/excel.util.ts` — validates the file is a real `.xlsx`
(ZIP magic-byte check) and sanitizes cells against formula-injection
before import, capped at 5,000 rows per import.

**NOT TESTED against a live server this session.**

---

## 12. Cloudinary

- **Account**: free tier at cloudinary.com is enough for local dev.
- **Credentials**: `CLOUDINARY_CLOUD_NAME`/`_API_KEY`/`_API_SECRET` in
  `.env` (or the `cloudinary` Configuration namespace, DB-first).
- **Upload flow**: the browser uploads **directly to Cloudinary** — the
  API only issues a short-lived signed upload payload
  (`POST /api/v1/uploads/signature`, body `{preset, folder}`,
  `createUploadSignature` in `cloudinary.service.ts`); product file bytes
  never pass through the Node process. Presets:
  `product_thumbnail`, `prescription_secure`, `cms_media`,
  `profile_picture`, `return_evidence`.
- **Replacement**: re-running the same upload flow with a new file and
  calling the product-image-update endpoint; the old asset is deleted via
  `destroyAsset(publicId)` (`product.service.ts::removeProductImage`,
  best-effort — a Cloudinary delete failure doesn't block the product
  update).
- **Deletion**: `destroyAsset(publicId)`, same file.
- **Verify**: the returned Cloudinary URL should load directly in a
  browser; check the Cloudinary Dashboard's Media Library for the
  uploaded asset under the folder you passed.
- **Troubleshooting**: a 401 from `/uploads/signature` means
  `CLOUDINARY_API_SECRET` is wrong (signature won't match on Cloudinary's
  side); a signature-mismatch error from Cloudinary itself usually means
  the `folder`/`preset` sent to the upload call don't exactly match what
  was signed.

**NOT TESTED — EXTERNAL CREDENTIAL REQUIRED** (no Cloudinary account
credentials available in this environment).

---

## 13. Razorpay TEST mode

1. Razorpay Dashboard → toggle to **Test Mode** (top-left switch) →
   Settings → API Keys → Generate Test Key → copy Key ID (`rzp_test_...`)
   and Key Secret into `.env` as `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`.
   **Never put a `rzp_live_...` key in a local `.env`.**
2. Webhook: Settings → Webhooks → Add New Webhook.
   - **URL**: your tunneled HTTPS URL + `/api/v1/webhooks/razorpay` (e.g.
     `ngrok http 5000`, then `https://<ngrok-id>.ngrok.io/api/v1/webhooks/razorpay`)
   - **Secret**: any string you choose — put the same value in
     `RAZORPAY_WEBHOOK_SECRET` in `.env`
   - **Events** actually handled by this codebase
     (`payment.service.ts::handleRazorpayWebhookEvent`): `payment.captured`,
     `payment.failed`. Enable at least those two.
3. Order creation: `POST /api/v1/payments/razorpay/order` `{orderId}`
   (auth required) → returns a Razorpay order to hand to Razorpay
   Checkout.
4. Verification: `POST /api/v1/payments/razorpay/verify`
   `{razorpay_order_id, razorpay_payment_id, razorpay_signature}`.
5. For test card/UPI/netbanking details, use whatever Razorpay's own Test
   Mode checkout screen currently documents/auto-fills — this repository
   does not document or hardcode any test payment credentials, and none
   are invented here.

**NOT TESTED — EXTERNAL CREDENTIAL REQUIRED.**

---

## 14. Complete end-to-end test order

Every row: **ACTION** → **EXPECTED RESULT** → **WHERE TO VERIFY**. This
entire flow requires a running Docker stack + Razorpay test credentials +
(optionally) MinIO — **NOT TESTED end-to-end this session**; each
ACTION/EXPECTED pair below is CODE-VERIFIED against the named
service/route file, not observed running.

| # | Action | Expected result | Where to verify |
|---|---|---|---|
| 1 | `POST /api/v1/auth/register` | 201, customer created | `auth.service.ts` |
| 2 | `POST /api/v1/auth/login` | Tokens issued, or `otpRequired:true` if OTP-on-login is enabled | `auth.service.ts` |
| 2b | (if OTP) `POST /api/v1/auth/login/verify-otp` | Tokens issued | `auth.routes.ts` |
| 3 | Browse `GET /api/v1/products` | List of active products | Storefront `/products` |
| 4 | Search `GET /api/v1/search` | Matching products | `search.routes.ts` |
| 5 | `GET /api/v1/products/:id` | Full product detail incl. `gstRate`, `medicine.prescriptionRequired` | Product detail page |
| 6 | `POST /api/v1/cart/items` | Item added, stock not yet touched | `cart.routes.ts` — stock deduction is at checkout, not add-to-cart (Step 16) |
| 7 | `PATCH /api/v1/cart/items/:productId` | Quantity updated | Cart page |
| 8 | `POST /api/v1/cart/coupon` `{code}` | Discount applied if valid (Step 21) | `coupon-validation.service.ts` |
| 9 | Add/select address | `POST/GET /api/v1/addresses` | Checkout address step |
| 10 | `POST /api/v1/delivery/serviceability` `{pincode}` (public, no auth) | Deliverable/undeliverable + fee | `shipping-calculation.service.ts` |
| 11 | Shipping fee shown at checkout | Server-computed, matches Step 10's response — never client-computed | `shipping-calculation.service.ts::calculateShippingCharge` |
| 12 | GST shown at checkout | `calculateOrderTax` — CGST+SGST (intra-state) or IGST (inter-state) | `tax-calculation.service.ts` |
| 13 | `POST /api/v1/orders/checkout` | Order created, stock deducted FEFO **at this step** (not at payment) | `order.service.ts::checkout` / `decrementStockFifo` |
| 14 | `POST /api/v1/payments/razorpay/order` | Razorpay order id returned | `payments.routes.ts` |
| 15 | Complete payment in Razorpay Test Checkout | — | Razorpay's own UI |
| 16 | `POST /api/v1/payments/razorpay/verify` | Signature verified, payment marked captured | `payment.service.ts` |
| 17 | Razorpay sends `payment.captured` webhook | `POST /api/v1/webhooks/razorpay` returns 200, `PaymentLogModel` row written | Admin → Payments, or `PaymentLogModel` |
| 18 | Order status advances toward `packed` | — | Admin → Orders |
| 19 | Invoice generated | Triggered on transition to **`packed`** status, not on payment capture (`invoice.service.ts`) | Admin → Invoices |
| 20 | Invoice PDF rendered | Puppeteer + Handlebars (`pdf.service.ts`), invoice number format `{PREFIX}-{sellerCode}-{year}-{seq6}` | Download the PDF |
| 21 | PDF uploaded to MinIO/S3 (or Cloudinary fallback) | `uploadAndRecordDocument` | MinIO console → `medcommerce-local/invoices/...` (Step 18) |
| 22 | Shipment created | `createShiprocketOrderForOrder` — only if Shiprocket is configured, requires invoice to already exist | Admin → Delivery/Shipments |
| 23 | Shiprocket sync (if configured) | AWB assigned, label fetched and re-uploaded through the same storage abstraction | `shiprocket-fulfillment.service.ts` |
| 24 | Notification sent | Order-confirmation / payment-success email (if SMTP configured) | `NotificationHistoryModel`, or Admin → Notifications → History |
| 25 | `GET /api/v1/orders/me` | New order appears | Customer → Order History |
| 26 | Invoice download | Presigned URL (S3) or direct Cloudinary URL | Customer → Orders → Invoice |

---

## 15. Razorpay failure tests

| Scenario | How to trigger | Expected order/payment state |
|---|---|---|
| Payment failure | Use Razorpay Test Mode's documented failure card/flow at checkout | `payment.failed` webhook fires → `failOrder()` → stock is **restored** via `restockOrderSales()` (`order.service.ts`) |
| Payment cancellation | Close the Razorpay Checkout modal without paying | Order stays in a pre-payment state; no webhook fires (Razorpay never attempted the charge) |
| Timeout | Let the Razorpay order expire without completing | Same as cancellation — no successful webhook, order remains unpaid |
| Invalid signature | POST to `/api/v1/webhooks/razorpay` with a tampered `X-Razorpay-Signature` | 401/400 rejected by `verifyWebhookSignature` — **fails closed**, confirmed by this repo's own `webhook-security.integration.test.ts` |
| Duplicate webhook | Razorpay redelivers the same event (or replay it manually with the same payload+signature) | `PaymentLogModel` records every delivery; `handleRazorpayWebhookEvent`'s handlers should be idempotent on order status — CODE-VERIFIED at the log layer, re-processing behavior for an already-captured order not independently re-tested this session |
| Delayed webhook | Simulate a slow network / hold the webhook delivery | No time-based rejection in the code — an old-but-valid signature is still accepted whenever it arrives |
| Invalid payment/order id | `POST /api/v1/payments/razorpay/verify` with a made-up `razorpay_order_id` | Signature verification fails → rejected, no order mutated |

**NOT TESTED — EXTERNAL CREDENTIAL REQUIRED** for the live-Razorpay rows;
the signature-verification fail-closed behavior is additionally backed by
an existing automated integration test in this repo
(`apps/api/src/integration-tests/webhook-security.integration.test.ts`).

---

## 16. Inventory test

```
Before order:  Batch.quantityAvailable = X   (Admin → Inventory → Batches)
POST /api/v1/orders/checkout  (quantity = N)
After order:   Batch.quantityAvailable = X - N   (deducted FEFO — earliest
               expiryDate batch consumed first, recalled batches excluded)
```

- **Insufficient stock**: `decrementStockFifo` throws
  `UnprocessableEntityError('Insufficient stock for product ...')`,
  aborting the entire checkout transaction — no partial order, no partial
  deduction (`order.service.ts`).
- **Out-of-stock**: same code path, `totalAvailable < quantity` including
  the zero case.
- **Concurrent purchase**: deduction happens inside a Mongo
  `session.withTransaction` around the FEFO batch reads/writes — races are
  serialized by the transaction, not by a separate atomic
  reserve-then-confirm step. There is no explicit
  reserve/release-on-cancel state machine; a *cancelled* order instead
  **restocks** via `restockOrderSales()` reversing the recorded
  `StockMovement` rows.
- **Where to verify**: Admin → Inventory → Batches (quantity), Admin →
  Inventory → Stock Movements (the SALE/RESTOCK ledger entries).

**NOT TESTED against a live server this session** (CODE-VERIFIED against
`order.service.ts`).

---

## 17. Invoice test

```
Order → status transitions to "packed"
  → generateInvoiceForOrder(orderId)   (invoice.service.ts)
  → PDF rendered (Puppeteer + Handlebars, pdf.service.ts)
  → uploadAndRecordDocument            (S3/MinIO, or Cloudinary fallback)
  → Admin → Invoices: presigned download link
  → Customer → Orders → Invoice: same presigned-URL mechanism
```

Fields present on the rendered invoice (`invoice.service.ts` +
`invoice.hbs`): store name/address/GSTIN/drug license, warehouse
name/GSTIN/state code, invoice number, order number, customer name +
billing/shipping address, line items with quantity/unit price, GST
breakdown (`cgstAmount`/`sgstAmount`/`igstAmount`), discount total,
shipping total, round-off, final amount, payment method. GST is computed
**once** and frozen onto the Invoice document — regenerating the PDF
re-renders the same numbers, it never recomputes tax.

**NOT TESTED against a live server this session** (CODE-VERIFIED). The
underlying **storage half** of this flow (upload/presign/download) *was*
independently verified in Step 5b with a synthetic PDF buffer through the
exact same `storage.service.ts` functions this invoice flow calls.

---

## 18. Running S3 Locally With MinIO

Ports below are exactly what `docker-compose.dev.yml` publishes — nothing
invented.

1. **Start MinIO** — part of the stack in Step 5a
   (`docker compose ... up -d`), or standalone:
   ```bash
   docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env up -d minio minio-init
   ```
2. **Open the MinIO console**: `http://localhost:9001`
3. **Login**: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env`
   (default local values `minioadmin` / `minioadmin123`)
4. **Verify the bucket**: the console's Buckets list should show
   `medcommerce-local`, created automatically by the `minio-init`
   one-shot container — no manual bucket-creation step needed.
5. **Start the backend**: part of Step 5a, or `npm run dev --workspace=@medcommerce/api`
6. **Verify backend → MinIO connectivity**: `curl http://localhost:5000/health/ready`
   (checks Mongo+Redis, not S3 by design — Part 52's "no third-party calls
   on every health probe" — so also directly exercise storage:
   `curl http://localhost:9000/minio/health/live` should return 200, and
   any action in Step 17 that calls `uploadDocument` will fail loudly in
   the API logs if MinIO is unreachable, since `isS3Configured()` returning
   true does not itself guarantee reachability — that's what
   `verifyBucketAccess()` is for.
7. **Generate an invoice**: run through Step 17 (needs an order at
   `packed` status).
8. **Verify the invoice object**: MinIO console → `medcommerce-local`
   bucket → browse to `invoices/{sellerId or "unassigned"}/{yyyy}/{mm}/{invoiceId}.pdf`
9. **Download the invoice**: click the object in the console (uses
   MinIO's own signed URL), or use the app's Admin → Invoices download
   button (uses this app's own 300-second presigned URL —
   `getPresignedDownloadUrl` default TTL).
10. **Generate a shipping label** (if Shiprocket is configured — Step 20):
    `shiprocket-fulfillment.service.ts::fetchAndStoreLabel` downloads
    Shiprocket's PDF and re-uploads it through the same
    `uploadAndRecordDocument` path → object appears under
    `shipping-labels/{sellerId}/{yyyy}/{mm}/{shipmentId}.pdf`.
11. **Verify the shipping label**: same MinIO console browse as step 8,
    under the `shipping-labels/` prefix.
12. **Generate logs**: just run the API for a while (pino writes to
    `LOG_DIRECTORY`, rotated every `LOG_ROTATION_HOURS` = 6h by
    `log-rotation.ts`).
13. **Verify the log archive upload**: after a rotation boundary, the
    `log-retention-sweep` BullMQ job (worker process) compresses and
    uploads the rotated file to `logs/{category}/{yyyy}/{mm}/{dd}/{instanceId}/...log.gz`
    — visible in the console under that prefix once the worker's next
    `LOG_ARCHIVAL_WORKER_INTERVAL_MINUTES` (default 15 min) tick runs.

**VERIFIED (this session, via `s3rver` substituting for MinIO — see the
note at the top of this document)**: steps 5-9's underlying mechanism
(upload → object exists → presigned download → byte-exact retrieval) —
confirmed working through the real application code. **Steps 1-4 and
10-13 (the MinIO container itself, its console UI, and the
Shiprocket/log-archival integrations) were not executed this session** —
CODE-VERIFIED only.

---

## 19. S3 failure test

Safe to run locally — MinIO holds no real customer data.

| Test | How | Expected behavior |
|---|---|---|
| Stop MinIO | `docker compose ... stop minio` | Uploads that were already using S3 start failing; `document-storage.helper.ts` catches the error, calls `markDocumentFailed`, and **rethrows** — the invoice-generation caller sees a real error rather than a silently-lost document. It does **not** auto-fall-back to Cloudinary mid-flight (the S3-vs-Cloudinary choice is made once, up front, via `isS3Configured()` — Cloudinary fallback is for "S3 was never configured," not "S3 is temporarily down"). |
| Invalid credentials | Set `AWS_SECRET_ACCESS_KEY` to garbage, restart API | Every S3 call fails with an auth error from the SDK; `verifyBucketAccess()` returns `false`, logged as a warning — does not crash the process |
| Missing bucket | Delete the bucket in the MinIO console, then upload | `PutObjectCommand` fails (`NoSuchBucket`); same catch/rethrow/log path as "stop MinIO" above |
| Network failure | Firewall/block port 9000 | Same as "stop MinIO" — connection-level errors surface the same way |
| Upload failure | Any of the above during `uploadDocument` | `document-storage.helper.ts` calls `markDocumentFailed(documentType, entityId, sellerId, error.message)` before rethrowing — the failure is recorded on the `Document` model, not just logged and dropped |
| Download failure | Object deleted out-of-band, then `getPresignedDownloadUrl` used | Presigned-URL generation itself still succeeds (S3 doesn't check existence when *signing*); the actual GET against that URL 404s in the browser — this is standard S3 presigned-URL behavior, not app-specific error handling |

**Business data stays consistent**: order/payment/invoice *records* in
MongoDB are never deleted or corrupted by an S3 failure — only the
document's storage/upload state is affected, and that's explicitly tracked
(`markDocumentFailed`) rather than silently swallowed.

**CODE-VERIFIED** by reading `document-storage.helper.ts`'s error path;
**NOT TESTED** against a live MinIO container this session (Docker
unavailable).

---

## 20. Shiprocket

**No sandbox/test mode exists in this codebase** — `SHIPROCKET_BASE_URL`
defaults to `https://apiv2.shiprocket.in/v1/external`, the **live** API,
with no env var or config flag to point at a sandbox. This is stated
plainly rather than inventing a sandbox flow that doesn't exist. If you
want to exercise Shiprocket locally, you need a real Shiprocket account
and will be hitting their live (if low-stakes, since you control what
orders you create) API.

If configured (`SHIPROCKET_EMAIL`/`_PASSWORD`/`_PICKUP_LOCATION` set):

- **Order sync**: `createShiprocketOrderForOrder(orderId, actor)`
  (`shiprocket-fulfillment.service.ts`) — only for orders already at
  `PACKED`/`READY_FOR_DISPATCH` with an invoice already generated.
- **Shipment creation**: `POST {baseUrl}/orders/create/adhoc`, then
  `assignAwbForShipment` (`/courier/assign/awb`).
- **Tracking**: `syncShipmentTracking` — manual pull from
  `/courier/track/awb/:awb`; also passively updated via the webhook below.
- **Webhook**: `POST /api/v1/webhooks/shiprocket`, `express.json()`,
  authenticated by a static token in the `x-api-key`/`x-shiprocket-token`
  header, compared constant-time against `SHIPROCKET_WEBHOOK_TOKEN` —
  **fails closed** if unconfigured (a Prompt-24 fix; previously failed
  open). Deduplicated via a unique index on `ShiprocketWebhookLogModel`.
- **Delivery status**: mapped through `SHIPROCKET_STATUS_MAP`
  (`packages/shared`).
- **Label / MinIO storage**: `fetchAndStoreLabel` downloads Shiprocket's
  own label PDF and re-uploads it through the same
  `document-storage.helper.ts` used for invoices — same MinIO
  bucket/prefix mechanism (`shipping-labels/...`).
- **PIN serviceability without Shiprocket configured**: still works —
  `checkPincodeServiceability` always computes from the internal
  `ShippingZone`/`ShippingRule` engine **first** (authoritative), and only
  optionally enriches with live Shiprocket courier data when configured;
  checkout never blocks on Shiprocket being unreachable.

**NOT TESTED — EXTERNAL CREDENTIAL REQUIRED.**

---

## 21. Coupon test

```
Admin → Coupons → Create Coupon
  code, type (percentage/flat), value, minCartValue, usageLimitGlobal,
  usageLimitPerUser (default 1), validFrom/validTo, firstOrderOnly?
Customer: POST /api/v1/cart/coupon {code}
  → validateCouponForCart checks: feature toggle, active, date window,
    seller scope, min cart value, user allowlist, first-order-only,
    product/category eligibility, then usage limits
Checkout → coupon discount carried through to the order total
Admin → Orders → discount line should match what the customer saw
```

- **Invalid**: unknown code → 404/validation error, no discount applied.
- **Expired**: outside `validFrom`/`validTo` → rejected at validation.
- **Usage limit**: `recordCouponUsage()` is the authoritative commit,
  inside the checkout's Mongo transaction — uses an atomic
  `findOneAndUpdate` with `$expr: {$lt: ['$usageCount','$usageLimitGlobal']}`
  plus a per-user `CouponUserUsageCounterModel` upsert, so the limit is
  enforced at the database level, not just pre-checked in application code.
- **Concurrent usage**: the atomic-update guard above is specifically what
  prevents two racing checkouts both succeeding past a global/per-user
  limit — CODE-VERIFIED by reading `recordCouponUsage`, not independently
  load-tested against a live coupon this session.

**NOT TESTED against a live server this session.**

---

## 22. GST test

```
GstSettingModel: hsnCode → gstRate (Admin → Tax)
Product.gstRate cached from the current ProductTaxMapping for that HSN
Checkout: calculateOrderTax(order)
  → resolveGstTaxType(warehouseStateCode, customerStateCode)
    intra-state → split into CGST + SGST (half each)
    inter-state → IGST (full rate)
  → Product price − Discount, then GST applied, then + Shipping = Final total
Invoice: same numbers, frozen at first generation (never recomputed later)
```

Verify **checkout total**, **Order.totals**, and **Invoice totals** all
show the identical GST breakdown for the same order — they read from the
one `calculateOrderTax` call's persisted result, not three independent
calculations, so a mismatch would indicate a real bug, not expected
rounding drift.

**NOT TESTED against a live server this session** (CODE-VERIFIED against
`tax-calculation.service.ts`).

---

## 23. Shipping test

```
POST /api/v1/delivery/serviceability {pincode}   (public, no auth)
  → deliverable pincode: zone matched, fee + ETA returned
  → undeliverable pincode: no matching zone/rule → not serviceable
Checkout shipping fee = calculateShippingCharge()
  (shipping-calculation.service.ts) — zone-matched by pincode/state (or a
  catch-all zone), then rule-matched by cart-value range + optional weight
  range + delivery type; freeShippingThreshold zeroes the fee above that
  cart value; an unconfigured store returns 0, not an error
```

Fee calculation is **entirely server-side** — the frontend never computes
or overrides a shipping number; it only displays whatever
`/delivery/serviceability` (or the checkout response) returns. Verify
customer-facing (checkout page shipping line) and admin-facing (Order
detail's shipping total) show the same number.

**NOT TESTED against a live server this session.**

---

## 24. Prescription test

Implemented (not a stub). Config namespace `prescription`
(`prescription-config.service.ts`), fields: `managementEnabled` (master
switch), `uploadEnabled`, `verificationEnabled`, `reuseEnabled`,
`orderBlockingEnabled` (default **true** — blocks fulfillment past
`PACKED` while unverified), `checkoutUploadRequired` (default false),
`validityDays` (default 180).

```
Enable prescription management (Configuration → Prescriptions →
  managementEnabled: true)
Mark a product prescriptionRequired: true (or leave its Category's
  requiresPrescriptionDefault: true)
Customer flow: POST /api/v1/prescriptions/upload-url (Cloudinary signed
  upload, preset "prescription_secure") → POST /api/v1/prescriptions/
  (confirm) → GET /api/v1/prescriptions/me
Admin review: GET /api/v1/prescriptions/pending →
  POST /api/v1/prescriptions/:id/approve  or  /reject
Then: Configuration → Prescriptions → managementEnabled: false
Verify: isPrescriptionManagementEnabled() is the single choke-point every
  enforcement site calls (checkout validation, order-status transition,
  upload, verification, reuse) — disabling it turns off ALL prescription
  gating at once, not just the UI.
```

**NOT TESTED against a live server this session** (CODE-VERIFIED against
`prescription-config.util.ts`/`prescription.service.ts`).

---

## 25. Notifications

Central entry point: `enqueueNotification()`
(`notification.service.ts`) — every module goes through this one
function, which writes `NotificationQueueModel` and enqueues a BullMQ job
consumed by the worker process (`worker.ts` → `notification.worker.ts`).

**Channels**: `email` (real — via SMTP, `getProviderHealth()` reports
`not_configured` until `SMTP_HOST` is set), `sms`/`whatsapp`/`push`
(**log-only stubs** — no real provider is wired for any of the three;
they always report `not_configured`, this is NOT a bug to chase, it's the
actual current implementation).

**Events observed wired to `enqueueNotification`**: OTP (critical, bypasses
category gating), registration, password reset, payment
captured/failed, invoice generated, return status changes, shipment status
changes, admin alerts (e.g. `payment_failed_admin`). Each category
(ORDER/PAYMENT/SHIPPING/RETURN/PRESCRIPTION/ADMIN/SYSTEM) has its own
Configuration on/off toggle plus a master `notificationsEnabled` switch —
`critical` notifications (OTP/security) bypass all of that gating.

**History/retry**: customer-facing `GET /api/v1/notifications` +
unread-count + mark-read (`/account/notifications` in the frontend);
admin `retryFailedNotification(historyId, actorId)` re-queues a failed
delivery from `NotificationHistoryModel`.

**NOT TESTED — EXTERNAL CREDENTIAL REQUIRED** for actual email delivery;
in-app queuing/history is CODE-VERIFIED, not exercised against a live
server this session.

---

## 26. Logging

- **Application logs**: pino, `apps/api/src/config/logger.ts`.
- **Request ID**: `apps/api/src/middlewares/request-id.middleware.ts`,
  applied before every other middleware.
- **Actor context**: `apps/api/src/middlewares/request-context.middleware.ts`
  — requestId/actorId/actorType/role/jobId merged into every log line via
  pino's `mixin`, backed by `AsyncLocalStorage`
  (`config/request-context.ts`).
- **Sensitive-data masking**: pino `redact.paths` (`logger.ts`) — covers
  auth headers/cookies, passwords, OTP codes, Razorpay signature/webhook
  secret, AWS/S3 credentials, Shiprocket password, card/bank fields,
  presigned/signed URLs, API keys/client secrets/private keys; censor
  value is the literal string `[REDACTED]`.
- **Rotation**: `LOG_ROTATION_HOURS` = 6 (default, `env.schema.ts`) —
  wall-clock-boundary based, not per-calendar-day.
- **Compression + S3/MinIO upload**: rotated files are gzip-compressed and
  uploaded to `logs/{category}/{yyyy}/{mm}/{dd}/{instanceId}/...log.gz`
  via the log-retention-sweep BullMQ job (worker process), governed by
  `LOG_ARCHIVAL_WORKER_INTERVAL_MINUTES` (default 15) and
  `LOG_S3_ARCHIVAL_ENABLED` (default true).
- **Retention**: `AWS_S3_LOG_RETENTION_DAYS` = 20 (default) — enforced
  primarily via an S3 **lifecycle rule** scoped to the `logs/` prefix
  only (`configureLogLifecycleRule`, never touches
  invoices/labels/prescriptions), with an application-level sweep as a
  safety net when the IAM credentials can't set lifecycle rules
  (`isPastRetention` in `storage.util.ts`).
- **Logging failures don't crash business operations**: log-upload
  failures are caught, logged as warnings, and retried up to
  `LOG_UPLOAD_RETRY_LIMIT` (default 8) — they never propagate into the
  request/response cycle of whatever business action happened to log
  something.

**CODE-VERIFIED**; 6-hour rotation and 20-day retention were also
confirmed as the intentional, previously-audited defaults in this repo's
own `docs/SECURITY.md` (§4). Not independently re-executed this session.

---

## 27. Admin order management

Terminology as it appears in the actual routes/admin UI:

```
Admin → Orders → order list/detail (GET /api/v1/orders — admin-scoped
  listing lives alongside the customer /me listing, gated by RBAC)
  → Payment: Admin → Payments (adminPaymentsRouter, /api/v1/admin/payments)
  → Order status: PATCH transitions through the order's state machine —
    reaching "packed" is what triggers invoice generation (Step 17)
  → Invoice: Admin → Invoices (/api/v1/admin/invoices) — view/download
  → Shipping/Shipment: Admin → Delivery (/api/v1/shipments,
    /api/v1/delivery) — create Shiprocket order, assign AWB, track
  → Delivery: status synced from Shiprocket webhook or manual pull
  → Return: Admin → Returns (/api/v1/returns) — approve/reject a
    customer-initiated return request
  → Refund: same Returns flow — issueRefund() calls the Razorpay Refund
    API, idempotent (a stored refundId short-circuits a repeat call)
  → Cancellation: order cancel restocks inventory via the same
    restockOrderSales() path as a failed payment
  → Prescription: Admin → Prescriptions (/api/v1/prescriptions/pending) —
    approve/reject an uploaded prescription blocking a PACKED transition
```

**NOT TESTED against a live server/browser this session.**

---

## 28. Customer account

```
/account            — dashboard
/account/profile    — GET/PATCH /api/v1/profile/me
/account/addresses  — /api/v1/addresses
/account/orders     — GET /api/v1/orders/me
/account/orders/:id — GET /api/v1/orders/:id, incl. invoice download link
/account/prescriptions — customer's own uploaded prescriptions
/account/notifications — GET /api/v1/notifications
Password reset       — /forgot-password → /reset-password
Logout                — DELETE /api/v1/auth/sessions/:sessionId or the
  "log out everywhere" flow; refresh-token cookie (mc_refresh_token) cleared
```

**NOT TESTED against a live server/browser this session.**

---

## 29. Security verification (manual tests)

All of the following are backed by this repo's own `docs/SECURITY.md`
audit and its automated test suite
(`apps/api/src/integration-tests/*.integration.test.ts`); running them
yourself against a live local instance is still worth doing once.

| Test | How | Expected |
|---|---|---|
| Customer → Admin API | Log in as customer, call an `/admin/*` or RBAC-gated route | 401/403 |
| Platform Admin → Super Admin API | Log in as `admin`, call `POST /admin/rbac/users` with `role: "super_admin"`, or try to suspend a super_admin account | 403 — `assertCanAssignRole`/`assertCanManageTarget` |
| Disabled feature → direct API | Disable `prescription.managementEnabled`, call `/api/v1/prescriptions/upload-url` directly | Rejected — `isPrescriptionManagementEnabled()` gate, not just UI hiding |
| Expired JWT | Wait out `JWT_ACCESS_EXPIRES_IN` (15m default), call any authed route | 401, refresh flow required |
| Invalid JWT | Send a tampered/garbage Bearer token | 401 |
| OTP expiry | Wait past `otpExpirySeconds`, submit the old code | Rejected |
| Rate limiting | Hammer `/api/v1/auth/login` past `authRateLimiter`'s limit | 429 |
| Invalid input | POST malformed JSON body to any `validate()`-guarded route | 400 with Zod field errors |
| File upload | Try uploading a non-PDF/JPG/PNG as a prescription, or an oversized file | Rejected by `assertValidPrescriptionFile` before a presigned URL is even issued |
| Webhook signature | POST to `/api/v1/webhooks/razorpay` with a bad signature | 401/400, fails closed (also unconfigured-secret case — Step 15) |
| IDOR | As Customer A, try `GET /api/v1/orders/:idBelongingToCustomerB` | Should 403/404 — ownership check expected at the service layer for every customer-scoped resource |
| Sensitive data exposure | Trigger any error/log line involving a password/token/secret, inspect the log | `[REDACTED]` — pino redact paths (Step 26) |

**CODE-VERIFIED / backed by this repo's existing automated integration
tests** (per its own `docs/SECURITY.md`); **not independently re-run this
session** against a live instance.

---

## 30. Docker operations

```bash
# Build (no cache)
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml build --no-cache

# Start (detached)
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env up -d

# Stop (keeps containers + volumes)
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml stop

# Restart one service
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml restart api

# Logs
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml logs -f [service]

# Status
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml ps

# Health (application-level)
curl http://localhost:5000/health/ready

# Enter a container shell
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml exec api sh

# Rebuild + restart just one service
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml up -d --build api
```

**⚠️ DESTRUCTIVE — removes containers AND named volumes (all local Mongo
data, MinIO objects, Redis data):**
```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml down -v
```

**⚠️ DESTRUCTIVE — full Docker host cleanup** (this repo already ships
`infra/scripts/cleanup-docker.sh` — reviewed: it explicitly prunes
stopped containers/dangling images/unused networks/old build cache, and
its own comment states it never touches named volumes):
```bash
./infra/scripts/cleanup-docker.sh
```

---

## 31. Troubleshooting

| Problem | Cause | How to check | Solution |
|---|---|---|---|
| Backend won't start | Missing/invalid required env var | API process exits immediately with `console.error('Invalid environment configuration:', ...)` (`config/env.ts`) | Check the printed field errors; usually `MONGO_URI`/`JWT_ACCESS_SECRET` |
| Frontend won't start | Port 5173 already in use, or `npm install` not run | Vite's own startup error | `lsof -i :5173`, kill the conflicting process, or `npm install` |
| MongoDB failure | Not a replica set, or not reachable | `docker compose logs mongo`, `/health/ready` shows `mongo: false` | Ensure `mongo-init-replica` ran once (`docker compose logs mongo-init-replica`); for a non-Docker Mongo, `mongosh --eval 'rs.initiate()'` |
| MinIO failure | Container down / wrong credentials | `curl http://localhost:9000/minio/health/live`, `docker compose logs minio` | Restart the service; verify `MINIO_ROOT_USER/PASSWORD` match `AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY` |
| Cloudinary failure | Bad credentials or signature mismatch | 401 from `/uploads/signature`, or a Cloudinary-side signature error | Re-check `CLOUDINARY_API_SECRET`; ensure `folder`/`preset` match exactly what was signed |
| Razorpay failure | Wrong/live-vs-test key mismatch | Razorpay Checkout itself reports the error, or `/payments/razorpay/order` 4xx | Confirm you're using `rzp_test_...` keys and Test Mode is on in the dashboard |
| Razorpay webhook failure | Signature mismatch, or `RAZORPAY_WEBHOOK_SECRET` doesn't match the dashboard | 400 `INVALID_WEBHOOK_SIGNATURE` in API logs | Re-copy the exact secret from the dashboard's webhook config into `.env` |
| Shiprocket failure | Not configured, or live-API auth failure (wrong email/password) | Shipment creation reports "temporarily unavailable"; check API logs for the `/auth/login` call | Verify `SHIPROCKET_EMAIL`/`_PASSWORD`; remember there is no sandbox — you're hitting the live API |
| OTP failure | OTP not enabled, or expired/exceeded max attempts | `otpEnabled`/`otpLoginEnabled` in Configuration → Authentication | Toggle on if intended; re-request a fresh OTP if expired |
| Google login failure | Env vars set but config flag off, or callback URL mismatch | 404/error on `/auth/google/callback` | Both `GOOGLE_CLIENT_ID/_SECRET` AND `authentication.googleAdminLoginEnabled` must be set; `GOOGLE_CALLBACK_URL` must exactly match the authorized redirect URI in Google Cloud Console |
| Invoice failure | PDF render error (Puppeteer/Chromium), or storage upload error | API logs around `generateInvoiceForOrder`; `markDocumentFailed` sets a failure reason on the `Document` record | Check Puppeteer/Chromium is available in the container (`apps/api/Dockerfile` installs it); check S3/MinIO reachability (Step 19) |
| S3/MinIO failure | See Step 19 | `verifyBucketAccess()` false, or upload/download errors in logs | Restart MinIO, verify bucket exists, verify credentials |
| **S3 requests silently hit real AWS instead of MinIO/s3rver** — **VERIFIED, hit this exact failure live in this session** | `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_S3_BUCKET` are all set (so `isS3Configured()` returns `true`), but `AWS_S3_ENDPOINT` is missing/empty — the AWS SDK then has no reason not to talk to real AWS with the given region | API/worker logs show `PermanentRedirect: The bucket you are attempting to access must be addressed using the specified endpoint`, `Endpoint: "<bucket>.s3.<region>.amazonaws.com"` — a dead giveaway the request left the machine | Set `AWS_S3_ENDPOINT` (e.g. `http://localhost:4568` for s3rver, `http://minio:9000` inside Docker) in the **same `.env` file the running process actually reads** (`apps/api/.env` for `npm run dev`, not necessarily the repo-root `.env`) — then **restart** the process; `tsx watch` reloads on source-file changes, never on `.env` changes, so editing the file alone does nothing until you Ctrl+C and rerun |
| s3rver `NoSuchBucket` / connection refused | The bucket directory under `-d <dir>` was never created, or s3rver isn't actually running | `curl -s -o /dev/null -w '%{http_code}' http://localhost:4568/<bucket>` — 200 means the bucket dir exists and s3rver is up | `mkdir -p <s3data-dir>/<bucket-name>` before starting `npx s3rver -d <s3data-dir> -p 4568`; the bucket name must match `AWS_S3_BUCKET` exactly |
| Notification failure | SMTP not configured (expected for SMS/WhatsApp/push — those are stubs) | `getProviderHealth()` reports `not_configured`; failed sends land in `NotificationHistoryModel` with a failure reason | Configure SMTP for email; SMS/WhatsApp/push are not wired to a real provider in this codebase — do not expect them to deliver |
| Docker failure | Daemon not running | `docker info` fails to connect to the daemon socket (exactly what happened in this authoring session) | Start Docker Desktop; wait for it to fully boot before running `docker compose` |
| Nginx failure | Only relevant when running the full container topology (not the `dev` overlay, which exposes ports directly) | `docker compose logs nginx` | Confirm `api`/`web` are healthy first — nginx's own healthcheck depends on `api: condition: service_healthy` |
| Logs not uploading | Worker process not running, or S3/MinIO unreachable | Check `worker` container logs for the `log-retention-sweep` job | Ensure the `worker` service is up (it's separate from `api`); verify MinIO connectivity |

---

## 32. Test data reset

**Local/test only — never run any of this against a production database.**

```bash
# Nukes ALL local data: Mongo documents, MinIO objects, Redis cache —
# DESTRUCTIVE, local dev only
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml down -v
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env up -d

# Re-seed after a reset
npm run seed:roles --workspace=@medcommerce/api
npm run seed:feature-flags --workspace=@medcommerce/api
npm run seed:dynamic-menu --workspace=@medcommerce/api
npm run seed:super-admin --workspace=@medcommerce/api
```

⚠️ **`docker compose down -v` is destructive and irreversible** for
whatever is in those volumes. There is no confirmation prompt — double
check `MONGO_URI`/`AWS_S3_BUCKET` actually point at your **local**
containers, not a shared/staging/production endpoint, before running it.
Nothing in this repository's scripts guards against pointing `.env` at a
real database and running a "reset" against it by mistake — that
responsibility is on whoever holds the `.env` file.

---

## 33. Local vs Staging vs Production

| | LOCAL | STAGING | PRODUCTION |
|---|---|---|---|
| Object storage | MinIO (`AWS_S3_ENDPOINT` set) | real AWS S3 (or compatible) | real AWS S3 |
| Payments | Razorpay Test Mode | Razorpay Test Mode (`.env.staging.example` pins `rzp_test_...`) | Razorpay **Live** Mode |
| Database | Local Docker `mongo` (or Atlas free tier) | dedicated staging replica set/Atlas project — never the prod cluster | production replica set/Atlas, least-privilege DB user |
| Credentials | `minioadmin`/dummy values, safe to commit as `.env.example` placeholders | real but low-stakes staging credentials, routed to sandbox inboxes (Mailtrap etc.) | real production secrets, via a secrets manager or Docker secrets — never hand-copied |
| `CONFIG_ENCRYPTION_KEY` | optional (warns if unset) | required, staging-specific key | required, production-specific key, different from staging |
| TLS | none (plain HTTP) | per `infra/nginx/ssl.conf.example` | real cert via `infra/scripts/init-letsencrypt.sh` |
| Monitoring | none | optional | `infra/docker/docker-compose.monitoring.yml` |
| Rate limits | `RATE_LIMIT_MAX=100` | `300` (looser — staging also used for load-testing) | `100` |

**Switching MinIO → AWS S3 is purely configuration-driven**: set
`AWS_S3_ENDPOINT=""` (or omit it) and point `AWS_REGION`/
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_S3_BUCKET` at real AWS —
zero code changes, per Step 3/4's implementation. The same is true for
every other integration in this codebase (Razorpay, Cloudinary,
Shiprocket, SMTP, Google OAuth) — all follow the identical
env-var-first / DB-Configuration-override / self-disabling-when-empty
pattern, by design, not by accident.

---

## 34. Final golden checklist

- [ ] Docker Desktop running
- [ ] MongoDB running (replica set initiated)
- [ ] MinIO running
- [ ] MinIO bucket (`medcommerce-local`) available
- [ ] Backend running (`GET /health/ready` → 200)
- [ ] Frontend running (`http://localhost:5173` loads)
- [ ] Super Admin created (`npm run seed:super-admin`)
- [ ] Platform Admin created (via Super Admin UI)
- [ ] Permissions configured
- [ ] Customer created (via `/register`)
- [ ] Product created (with category, brand, GST/HSN)
- [ ] Cloudinary image uploaded to the product
- [ ] Inventory configured (warehouse + batch quantity)
- [ ] GST configured (HSN → rate mapping)
- [ ] Shipping configured (zone + rule)
- [ ] Coupon configured
- [ ] Razorpay TEST configured
- [ ] Razorpay webhook configured (and reachable via tunnel)
- [ ] Customer order created (checkout)
- [ ] TEST payment completed
- [ ] Payment webhook received (`payment.captured` in `PaymentLogModel`)
- [ ] Inventory deducted (FEFO, verified in Stock Movements)
- [ ] Invoice generated (order reached `packed`)
- [ ] Invoice PDF created
- [ ] Invoice uploaded to MinIO (visible in console under `invoices/`)
- [ ] Shipping created (if Shiprocket configured)
- [ ] Notification received (if SMTP configured)
- [ ] Customer order history verified (`/account/orders`)
- [ ] Invoice downloaded (presigned URL resolves)
- [ ] Logs generated
- [ ] Logs rotated (6h boundary)
- [ ] Compressed logs uploaded to MinIO (under `logs/`)
- [ ] Log retention verified (20-day lifecycle rule / sweep)
- [ ] Admin workflow verified (order → shipment → delivery)
- [ ] Return/refund tested
- [ ] Security checks completed (Step 29)

None of the boxes above were checked off by an actual run in this
authoring session (no Docker daemon, no live external credentials) — this
checklist is the thing to walk through yourself once the stack is
actually running. Everything that *could* be verified without Docker or
third-party credentials (TypeScript correctness of every change, and the
real S3-upload/presign/download code path) was — see the "How this
document was verified" note at the top.
