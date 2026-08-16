# Production Deployment — EC2 (Docker Compose)

This is the exact, real deployment path for **this repository as it actually
exists** — every command below uses a script or Compose file already in the
repo (`infra/scripts/*.sh`, `infra/docker/docker-compose*.yml`); nothing here
is invented. Written for a single EC2 instance running the whole stack via
Docker Compose (the topology `docker-compose.prod.yml` is actually built
for) — not Kubernetes/ECS, since no manifests for those exist in this repo.

Assumes: you've launched the EC2 instance, can SSH into it, and have
already `git clone`d the repo there (as you said). Everything below picks
up from that point.

---

## 0. Before you start — decide these three things

1. **Domain name** pointed at this server. TLS (Let's Encrypt) needs a real
   domain resolving to the instance — you cannot get a trusted cert for a
   bare IP address. If you don't have one yet, get one (or use a subdomain
   of one you already own) and come back to DNS in step 4.
2. **Instance size.** `docker-compose.prod.yml`'s resource limits, if all
   containers actually use their ceiling, add up to roughly: API 2×1GB +
   worker 1GB + web 2×256MB + Mongo 2GB + Redis 512MB + nginx 256MB ≈
   **~6.5GB**. A `t2.micro`/`t3.micro` (1GB RAM) **will not run this
   stack** as configured — you'll get OOM-killed containers. Either use at
   least a `t3.medium` (4GB) — still tight but workable for low traffic —
   or reduce `replicas: 2 → 1` for `api`/`web` in `docker-compose.prod.yml`
   before building. Check now: `free -h` on the instance.
3. **Where Mongo/Redis live**: this guide uses the **self-hosted containers
   already defined in `docker-compose.yml`** (`mongo`, `redis` — simplest,
   no external account needed). If you'd rather point at MongoDB Atlas
   instead, skip starting the `mongo`/`mongo-init-replica` containers and
   set `MONGO_URI` to your Atlas connection string in step 5 — everything
   else below is identical either way.

---

## 1. Install Docker on the EC2 instance

**Ubuntu** (most common AMI choice — commands below assume this):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# run docker without sudo
sudo usermod -aG docker $USER
newgrp docker   # or log out/in

docker --version && docker compose version
```

**Amazon Linux 2023** instead: `sudo dnf install -y docker && sudo systemctl enable --now docker`, then install the `docker-compose-plugin` from the Docker repo the same way as above (Amazon Linux doesn't ship the compose plugin in its default repos).

**Add swap if the instance has < 4GB RAM** (cheap insurance against a build
or Mongo spike OOM-killing something mid-deploy):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 2. Firewall

Two separate layers — **both** need the same ports open, or nothing works:

**a) AWS Security Group** (in the EC2 console, on the instance/its SG) —
inbound rules: **22** (SSH, ideally restricted to your IP), **80** (HTTP),
**443** (HTTPS). This can't be done from inside the instance — do it in the
AWS Console or via `aws ec2 authorize-security-group-ingress`.

**b) Host firewall (UFW)** — the repo ships a script for exactly this:

```bash
cd /opt/medcommerce   # or wherever you cloned the repo — see step 3
sudo ./infra/scripts/setup-firewall.sh
```

This denies everything inbound except SSH/80/443 — deliberately does
**not** open 5000 (API), 27017 (Mongo), 6379 (Redis), 9090/3001
(Prometheus/Grafana), or 8081 (mongo-express, dev-only) — those are only
reachable through the nginx proxy or not at all from outside.

**Optional but recommended — Fail2Ban** (bans repeated SSH/auth-abuse IPs):

```bash
sudo apt-get install -y fail2ban
sudo cp infra/security/jail.local /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
```

---

## 3. Get the repo in the right place

The rest of this guide (and `infra/scripts/crontab.example`) assumes
`/opt/medcommerce`. If you already cloned it somewhere else, move it or
just substitute your path everywhere below:

```bash
sudo mkdir -p /opt/medcommerce
sudo chown $USER:$USER /opt/medcommerce
git clone <your-repo-url> /opt/medcommerce
cd /opt/medcommerce
```

---

## 4. DNS

At your DNS provider, create an **A record** for your domain (and `www` /
`api` subdomain if you're using the subdomain nginx variant — the default
setup in this repo is path-based: `yourdomain.com/api/*`, one domain, no
subdomain needed) pointing at the EC2 instance's **public IPv4 address**.

**Strongly recommended**: allocate an **Elastic IP** and associate it with
the instance first, *then* point DNS at the Elastic IP — a plain EC2 public
IP changes if the instance stops/starts, which would silently break DNS and
your TLS cert's renewal.

Wait for DNS to propagate before step 7 (`dig yourdomain.com` should
return the Elastic IP).

---

## 5. Environment files — the one non-obvious gotcha

**Two files are involved, and they need to end up with the same values:**

- `docker-compose.yml`'s `api`/`worker` services load their actual runtime
  environment from **`.env`** (hardcoded `env_file: ../../.env`, relative
  to `infra/docker/` → repo root).
- `deploy.sh`/`rollback.sh` pass `--env-file .env.production` to `docker
  compose` — that's for **Compose-file variable substitution only** (e.g.
  resolving `${REDIS_PASSWORD:?}` inside `docker-compose.prod.yml`), a
  *different* mechanism from the container's own env.

Simplest correct setup — make both real, and identical:

```bash
cp .env.production.example .env.production
```

Now edit `.env.production` and fill in real values (see the table below).
Once it's correct:

```bash
cp .env.production .env
```

Re-run that `cp` any time you change `.env.production`, so the two never
drift apart. (`.gitignore` already excludes both — never commit either.)

### What to fill in

| Variable | What to put |
|---|---|
| `NODE_ENV` | `production` (already set in the template) |
| `API_BASE_URL` | `https://yourdomain.com` (no `/api` suffix) |
| `WEB_BASE_URL` | `https://yourdomain.com` |
| `CORS_ORIGIN` | `https://yourdomain.com` |
| `MONGO_URI` | Self-hosted (this guide's default): `mongodb://mongo:27017/medcommerce?replicaSet=rs0` — **do not use the Atlas-style example URL from the template unless you actually chose Atlas in step 0.3** |
| `REDIS_URL` | `redis://:<same-password-as-below>@redis:6379` |
| `REDIS_PASSWORD` | Generate: `openssl rand -base64 24` — **must exactly match the password embedded in `REDIS_URL` above**, since `docker-compose.prod.yml` reads this var directly for the Redis container's `--requirepass` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `CONFIG_ENCRYPTION_KEY` | `openssl rand -base64 32` — required if you'll ever save Razorpay/Cloudinary/SMTP secrets via the admin Configuration UI instead of env vars |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | From your Cloudinary account (production cloud, not your dev one) |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` | **Live** keys (`rzp_live_...`) once you're ready to accept real payments — use test keys first if you want to verify the flow before going live |
| `RAZORPAY_WEBHOOK_SECRET` | Set this **after** step 8, once you know the final HTTPS URL to register in the Razorpay dashboard |
| `SMTP_HOST`/`_PORT`/`_USER`/`_PASS`/`_FROM` | A real transactional email provider (SES, Postmark, SendGrid SMTP relay) |
| `BACKUP_S3_BUCKET` | An S3 bucket for Mongo backups (step 11) — optional but recommended |

Leaving `AWS_*`/S3 vars empty is fine — invoice/label storage falls back to
Cloudinary automatically (self-disabling, same as local dev).

---

## 6. First build and start

```bash
cd /opt/medcommerce
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml --env-file .env.production build --pull
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d
```

This starts, in dependency order: `mongo` → `mongo-init-replica` (initiates
the replica set once, then exits — that's expected, it's a one-shot job,
not a crash) → `redis` → `api` (×2) → `worker` → `web` (×2) → `nginx`.

Watch it come up:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml ps
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml logs -f api
```

At this point the site is reachable over **plain HTTP** on your domain
(port 80) — TLS isn't wired up yet (next step). `curl http://yourdomain.com/health` should return `{"status":"ok"}`.

---

## 7. Seed roles and create the first Super Admin

Same scripts as local dev, just run inside the running `api` container:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml exec api npm run seed:roles

# Set these three first, one-off, for just this command:
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml exec \
  -e SUPER_ADMIN_NAME="Super Admin" \
  -e SUPER_ADMIN_EMAIL="you@yourdomain.com" \
  -e SUPER_ADMIN_PASSWORD="<a real strong password>" \
  api npm run seed:super-admin
```

(The script is idempotent — safe to re-run; it refuses to create a second
`super_admin` if one already exists.) Log in at `https://yourdomain.com/login`
once step 8 has HTTPS live, or `http://yourdomain.com/login` right now to
confirm it works before TLS.

**Change that password via the account's own Profile page immediately
after first login** — it was just typed into a shell command.

---

## 8. TLS (Let's Encrypt)

Only works once DNS (step 4) actually resolves to this server — Let's
Encrypt validates domain ownership by fetching a file from
`http://yourdomain.com/.well-known/acme-challenge/...`, which the
currently-running plain-HTTP nginx (step 6) already serves correctly.

```bash
DOMAIN=yourdomain.com EMAIL=you@yourdomain.com ./infra/scripts/init-letsencrypt.sh
```

If you want to test the flow first without burning Let's Encrypt's rate
limit (5 certs/domain/week), add `STAGING=1` first, confirm it issues a
(untrusted) cert successfully, then re-run without `STAGING=1` for the
real one.

Then enable HTTPS in nginx:

```bash
cp infra/nginx/conf.d/ssl.conf.example infra/nginx/conf.d/ssl.conf
# edit infra/nginx/conf.d/ssl.conf — replace every
#   medcommerce.example.com  ->  yourdomain.com

docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml exec nginx nginx -s reload
```

`https://yourdomain.com` should now load with a valid certificate. The
`certbot` service in `docker-compose.prod.yml` is already running and
checks for renewal every 12 hours — no separate cron job needed for
renewal itself.

**Now go back and set `RAZORPAY_WEBHOOK_SECRET`** (step 5) — register the
webhook in the Razorpay dashboard pointing at
`https://yourdomain.com/api/v1/webhooks/razorpay`, copy the secret it
gives you into `.env.production` **and** `.env`, then:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d api worker
```

(recreates just those two services to pick up the new env var).

---

## 9. Verify

```bash
BASE_URL=https://yourdomain.com ./infra/scripts/healthcheck.sh
```

Checks: API health, frontend serving, sitemap, DB-backed feature flags —
all must pass. Then walk through `docs/ADMIN_USER_GUIDE.md`'s §3
(Super Admin login) and §25 checklist against the real production URL.

---

## 10. Ongoing deploys

For every subsequent code change (after `git pull`ing the new commit on
the server):

```bash
cd /opt/medcommerce && git pull
./infra/scripts/deploy.sh
```

This builds the new images, recreates changed services, waits for the
healthcheck, and **automatically rolls back** if the healthcheck fails
after deploying. Manual rollback to the previous deploy at any time:

```bash
./infra/scripts/rollback.sh
```

---

## 11. Backups, cleanup, monitoring (recommended, not required to go live)

```bash
crontab -e
# paste the contents of infra/scripts/crontab.example, adjusting the email
# address in the healthcheck-alert line to something real
```

This wires up: nightly Mongo backup (to `BACKUP_S3_BUCKET` if you set one
in step 5, else local-only), weekly Docker image/cache cleanup, and a
5-minute external healthcheck that emails on failure.

**Optional monitoring** (Prometheus + Grafana, a separate opt-in compose
file — doesn't run unless you explicitly add it):

```bash
docker compose -f infra/docker/docker-compose.yml \
                -f infra/docker/docker-compose.prod.yml \
                -f infra/docker/docker-compose.monitoring.yml \
                --env-file .env.production up -d
```

Grafana at `:3001` (default `admin`/`admin` — **change immediately**),
Prometheus at `:9090`. Neither port is opened in the firewall (step 2) by
design — reach them via an SSH tunnel (`ssh -L 3001:localhost:3001 ...`)
rather than exposing them publicly.

---

## Troubleshooting

| Problem | Check |
|---|---|
| `docker compose build` OOMs or hangs | Instance too small (step 0.2) — add swap (step 1) or upsize |
| Containers keep restarting | `docker compose ... logs <service>` — usually a missing/wrong `.env` value; remember step 5's `.env` vs `.env.production` gotcha |
| `mongo-init-replica` container exits immediately | **Expected** — it's a one-shot job that initiates the replica set once, not a long-running service |
| Let's Encrypt fails with a domain-validation error | DNS hasn't propagated yet, or port 80 isn't reachable — check the AWS Security Group (step 2a) separately from UFW (step 2b), both must allow it |
| Site loads on HTTP but not HTTPS after step 8 | Confirm `infra/nginx/conf.d/ssl.conf` was actually created (not just the `.example`) and nginx was reloaded, not just restarted-elsewhere |
| Razorpay webhook returns 401/400 | `RAZORPAY_WEBHOOK_SECRET` in `.env`/`.env.production` doesn't match the dashboard, or the two files drifted apart — re-`cp` per step 5 |
| `deploy.sh` rolled back automatically | Read the healthcheck output above the rollback line — it names exactly which check failed |
