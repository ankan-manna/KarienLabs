# MedCommerce — Local to EC2 Production Deployment Guide

## 1. Local: check changes

```bash
git status
git branch --show-current
git diff
git diff --stat
```

Review untracked files before using `git add .`. Do not commit `.env`, secrets, browser downloads, temporary notes, build output, or unnecessary generated files.

Remove an unwanted untracked file/folder:

```bash
rm -rf "path/to/unwanted-file-or-folder"
```

Discard an unwanted tracked change:

```bash
git restore path/to/file
```

## 2. Local: commit

After reviewing:

```bash
git add .
git status
git diff --cached --stat
git commit -m "Your feature or fix"
git log --oneline -3
```

## 3. Local: push the feature branch

Example:

```bash
git push -u origin s3-storage-retention-and-homepage-cms-verification
```

For an existing branch:

```bash
git push origin <feature-branch>
```

## 4. Merge into production `main`

If EC2 deploys from `main`:

```bash
git switch main
git pull --ff-only origin main
git merge <feature-branch>
git push origin main
```

Do not force-push `main` unless you intentionally want to rewrite remote history.

## 5. EC2: connect and check

```bash
cd /opt/medcommerce

git status
git branch --show-current
git log --oneline --decorate -5
```

Production should be on `main`.

## 6. EC2: BACKUP BEFORE DEPLOYMENT

Create a backup directory:

```bash
sudo mkdir -p /opt/medcommerce-backups
```

Back up production environment and Docker/Nginx configuration:

```bash
sudo tar -czf   /opt/medcommerce-backups/medcommerce-before-deploy-$(date +%Y%m%d-%H%M%S).tar.gz   .env   .env.production   infra/nginx   infra/docker
```

Verify:

```bash
ls -lh /opt/medcommerce-backups/
```

Do not continue until the backup exists.

## 7. EC2: fetch and update code

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

Verify:

```bash
git status
git log --oneline --decorate -5
```

The production commit should match `origin/main`.

## 8. Preserve production environment

Do not copy your local `.env` over `.env.production`.

Check required variables without exposing values:

```bash
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.production | sed 's/=.*$/=***/'
```

For example, verify that Redis has a value:

```bash
grep '^REDIS_PASSWORD=' .env.production
```

Never commit or paste production secrets into GitHub/chat.

## 9. IMPORTANT: use BOTH Compose files

This production setup uses:

```text
infra/docker/docker-compose.yml
infra/docker/docker-compose.prod.yml
```

The base file defines the build/image/service configuration. The production file provides production overrides.

Use this pattern for production commands:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   <command>
```

Do not use only `docker-compose.prod.yml`, because the override file does not contain the complete `build`/`image` definitions for all services.

## 10. Validate Compose BEFORE restarting

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   config
```

If you get errors such as:

```text
required variable REDIS_PASSWORD is missing
```

or:

```text
service "api" has neither an image nor a build context specified
```

STOP. Fix the configuration before running `up -d`.

## 11. Build the latest code

After Compose validation succeeds:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   build
```

## 12. Deploy the new containers

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   up -d
```

You do not normally need to manually delete the running containers first.

## 13. Verify containers

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   ps
```

Check:

```bash
docker ps
```

## 14. Check logs

API:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   logs --tail=100 api
```

Worker:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   logs --tail=100 worker
```

Nginx:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   logs --tail=100 nginx
```

Redis:

```bash
docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   logs --tail=100 redis
```

Look for crash loops, missing environment variables, database/Redis errors, migration errors, module errors, port conflicts, or Nginx errors.

## 15. Verify the live feature

A container being `Up` does not prove the deployment is successful.

Test the actual changed functionality in production. Also check browser console and relevant API logs.

## 16. If deployment fails

Do not immediately run `docker compose down -v` or delete volumes.

Collect:

```bash
git status
git log --oneline --decorate -5

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   ps

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   logs --tail=200
```

`docker compose down -v` can delete persistent Docker volumes. Avoid it during normal deployments.

## 17. Check which code is live

On EC2:

```bash
git rev-parse --short HEAD
git fetch origin
git rev-parse --short origin/main
```

These should match.

## 18. Restore a configuration backup if required

List backups:

```bash
ls -lh /opt/medcommerce-backups/
```

Inspect one:

```bash
sudo tar -tzf /opt/medcommerce-backups/medcommerce-before-deploy-YYYYMMDD-HHMMSS.tar.gz
```

Do not blindly extract a backup over the current production environment. Restore only the required file(s), after backing up the current versions.

# Standard workflow

## Mac

```bash
git status
git diff
git add .
git commit -m "Your feature/fix"
git push -u origin <feature-branch>

git switch main
git pull --ff-only origin main
git merge <feature-branch>
git push origin main
```

## EC2

```bash
cd /opt/medcommerce

git fetch origin

sudo mkdir -p /opt/medcommerce-backups

sudo tar -czf   /opt/medcommerce-backups/medcommerce-before-deploy-$(date +%Y%m%d-%H%M%S).tar.gz   .env   .env.production   infra/nginx   infra/docker

git switch main
git pull --ff-only origin main

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   config

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   build

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   up -d

docker compose   --env-file .env.production   -f infra/docker/docker-compose.yml   -f infra/docker/docker-compose.prod.yml   ps
```

Then inspect logs and test the live feature.

# Production rules

1. Never commit `.env`, `.env.production`, passwords, private keys, API secrets, JWT secrets, or Redis credentials.
2. Always create a production backup before deployment.
3. Always use `git pull --ff-only origin main` on EC2.
4. Always validate Compose with `config` before `up -d`.
5. Use both `docker-compose.yml` and `docker-compose.prod.yml`.
6. Do not run `docker compose down -v` during a normal deployment.
7. Do not force-push production `main`.
8. A GitHub push does not automatically update EC2 unless CI/CD is configured. In the current workflow, EC2 is updated manually with `git pull`, followed by Docker build and `up -d`.
