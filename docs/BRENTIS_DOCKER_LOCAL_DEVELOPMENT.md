# BRENTIS HEALTHCARE — Local Docker Development

Companion to the root [`docker-compose.yml`](../docker-compose.yml). This document covers the **new, lightweight local-dev compose setup** added for the BRENTIS redesign work. It does not replace or modify the project's existing `infra/docker/docker-compose.yml` (production base) or `infra/docker/docker-compose.dev.yml` (the existing full-local-infra dev setup, which runs its own Mongo/Redis/MinIO containers) — both remain exactly as they were.

## Why a separate compose file

The existing `infra/docker/docker-compose.dev.yml` always brings up a local `mongo`, `mongo-express`, `redis`, and `minio` — appropriate for that workflow, but not for this project's actual infrastructure: **MongoDB Atlas** (external) and **Redis on EC2** (external). Prompt 3 explicitly required a dev setup with no local Mongo/Redis containers, so this is a new, additive `docker-compose.yml` at the repo root, reusing the existing Dockerfiles rather than duplicating them.

## Services

| Service | What it runs | Port | Notes |
|---|---|---|---|
| `api` | `apps/api/Dockerfile`, `build` stage, via `tsx watch src/server.ts` | `5000` | Bind-mounts `apps/api` + `packages/shared` for hot reload. Connects to **external** MongoDB Atlas + Redis via `.env`. |
| `web` | `apps/web/Dockerfile.dev` (Vite dev server, HMR) | `5173` | Bind-mounts `apps/web` + `packages/shared`. Proxies `/api/*` to the `api` service via Docker DNS (`VITE_API_PROXY_TARGET=http://api:5000`). |
| `worker` | same image as `api`, `tsx watch src/worker.ts` | — | **Off by default.** Only starts with `--profile worker`. Needs a reachable `REDIS_URL` (BullMQ) to do anything useful. |

No `mongo`, `redis`, or `minio` service exists in this file, by design.

## MongoDB Atlas configuration

- Env var: **`MONGO_URI`** (the user-facing brief mentioned `MONGODB_URI` as an example name — the actual variable already used throughout `apps/api/src/config/database.ts` and the shared env schema is `MONGO_URI`; this document and the compose file use the real one).
- Get the connection string from Atlas → Database → Connect → Drivers.
- **Use a dedicated dev/staging Atlas database, not production** — this project's `apps/api/src/server.ts` calls `connectDatabase()` (a real `mongoose.connect`) synchronously before the HTTP server even starts listening, so whatever `MONGO_URI` points at is the database every local API request will read/write against. Never point local dev at a production cluster.
- Never hardcode the connection string anywhere in `docker-compose.yml` or any committed file — it belongs only in your local, git-ignored `.env`.

## EC2 Redis configuration

- Env var: **`REDIS_URL`**.
- Point it at the EC2 Redis endpoint (e.g. `redis://<ec2-host>:6379`, plus auth if the instance requires it).
- Most storefront/catalog browsing works without Redis reachable; caching, rate limiting, and the optional `worker` service specifically need it. If you don't have VPN/network access to the EC2 instance from your machine, the `api`/`web` services can still be developed against — but you should **expect Redis-dependent code paths (caching, some rate limiting, BullMQ jobs) to fail or no-op**, and that limitation should be called out explicitly whenever it's hit, not silently worked around.

## Optional worker

```bash
docker compose --profile worker up
```

Only start this when you actually need to exercise a background job. It will crash-loop if `REDIS_URL` isn't reachable — that's expected and is not a reason to add a local Redis container (don't).

## Environment setup

```bash
cp .env.example .env
# then fill in real values for MONGO_URI (Atlas), REDIS_URL (EC2), and
# whatever third-party keys (Cloudinary/Razorpay/SMTP/etc.) you need for
# the features you're actually testing
```

`.env` is already git-ignored (along with `.env.local`, `.env.*.local`, `.env.staging`, `.env.production`) — `.env.example` is the only one tracked, and it only ever contains placeholder values. Never put a real credential into `docker-compose.yml`, `.env.example`, or any other committed file.

## Starting and stopping

```bash
# start web + api
docker compose up -d

# check status
docker compose ps

# follow logs
docker compose logs -f api
docker compose logs -f web

# stop everything
docker compose down
```

## Apple Silicon (ARM64) note
`node:20-slim` is a multi-arch image; both `api` and `web` images were built successfully on this machine (Apple Silicon, Docker Desktop) during this session — see Verification below.

## Known conflict with the existing dev stack

This machine already has the **existing** `infra/docker/docker-compose.dev.yml` stack running (discovered during this session: `medcommerce-dev-api-1`, `-mongo-1`, `-redis-1`, `-minio-1`, `-mongo-express-1`, `-nginx-1`, `-worker-1`, up for several days) — it binds the same host ports this new file uses (`5000` for `api`, among others). **You cannot run both compose projects' `api`/`web` services at once** — stop one before starting the other:
```bash
# to free the ports for THIS file's api/web:
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml down
# then:
docker compose up -d
```
This isn't a bug in either file — it's two different local-dev strategies (full local infra vs. external Atlas/Redis) that were never meant to run simultaneously on the same ports.

## Verification performed this session

| Check | Result |
|---|---|
| `docker compose -f docker-compose.yml config -q` | **Passed** — valid syntax, no errors. (Note: avoid the non-quiet `config` form against this file — it resolves and prints every value from the real `.env` via `env_file:`, including secrets. Always use `-q` for a syntax-only check, or point at a disposable env file if you need to inspect resolved values.) |
| `docker compose -f docker-compose.yml build api web` | **Passed** — both images built successfully on Apple Silicon/ARM64, ~90s for `api` (cold npm install), cached thereafter. |
| `docker compose up` (live, end-to-end, against real Atlas/Redis) | **Not performed.** `apps/api/src/server.ts`'s `bootstrap()` calls `await connectDatabase()` before the HTTP listener starts — confirmed by reading the source — so the `api` container cannot reach a healthy state (and `web`, which `depends_on: api: condition: service_healthy`, cannot start either) without a real, reachable `MONGO_URI`. This session was not given real Atlas or EC2 Redis credentials, and per the project's own rule against introducing local MongoDB/Redis containers (including temporarily, for testing), no substitute database was spun up to fake this verification. |

**To complete live verification yourself:**
```bash
cp .env.example .env
# fill in real MONGO_URI (a dev/staging Atlas DB) and REDIS_URL (EC2)
docker compose up -d
docker compose ps                 # both should show healthy/running
curl http://localhost:5000/health # liveness check — doesn't need Mongo/Redis
curl http://localhost:5000/health/ready  # readiness — does need them (per apps/api/src/routes/health.routes.ts's Part 49/50/51 comment: liveness never depends on Mongo/Redis, readiness does)
curl http://localhost:5173        # Vite dev server
```

## Local development safety

This compose setup cannot accidentally touch production infrastructure **by default** — it has no hardcoded endpoints, reads everything from your own `.env`, and the restrictions below are enforced by *you* pointing `.env` at a safe dev/staging Atlas database, not by anything in the compose file itself:
- Point `MONGO_URI` at a dedicated dev/staging Atlas cluster, never production.
- Real Razorpay keys in `.env.example`'s format are `rzp_test_...` (test mode) — verify yours are test-mode keys, not live, before running any checkout flow locally.
- The optional `worker` only runs when explicitly started with `--profile worker` — it will not silently process a real production queue unless you explicitly point `REDIS_URL` at one (don't).
- No scheduled/cron production jobs run inside this compose setup — `startLogArchivalScheduler()`/`startPoolStatsSampler()` are per-process local schedulers, not shared production jobs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `api` container exits immediately with "Invalid environment configuration" | A required env var (per `envSchema` in `packages/shared`) is missing from `.env` | Compare against `.env.example`, fill in every required field (dummy values are fine for fields unrelated to what you're testing) |
| `api` hangs ~10s then exits with a Mongo connection/timeout error | `MONGO_URI` unreachable (wrong string, IP not allow-listed in Atlas, no network access) | Verify the connection string works via `mongosh "<MONGO_URI>"` outside Docker first; check Atlas Network Access allow-list includes your IP |
| `web` never starts | `api` never reached `service_healthy` | Check `docker compose logs api` — almost always the Mongo issue above |
| `/api/*` requests 500 from the browser hitting `web`'s dev server | `VITE_API_PROXY_TARGET` not set / `api` not actually healthy | This compose file already sets `VITE_API_PROXY_TARGET=http://api:5000` for you — confirm with `docker compose exec web env \| grep VITE_API_PROXY_TARGET` |
| Puppeteer/PDF-generation features fail inside this dev setup | The `build` stage target (used here for `tsx watch` hot-reload) doesn't install Chromium — only the Dockerfile's final `runtime` stage does | Expected/known tradeoff, same one the existing `infra/docker/docker-compose.dev.yml` already makes for the same reason; not something this compose file regressed |
| `docker compose config` prints real secrets | You ran the non-quiet form against this file, which loads the real `.env` via `env_file:` | Use `docker compose config -q` for a syntax check; never run bare `config` against this file with a real `.env` in place unless you intend to see the resolved values |

---

*Companion documents: [`BRENTIS_UI_REDESIGN_PROGRESS.md`](./BRENTIS_UI_REDESIGN_PROGRESS.md), [`BRENTIS_IMPLEMENTATION_ROADMAP.md`](./BRENTIS_IMPLEMENTATION_ROADMAP.md).*
