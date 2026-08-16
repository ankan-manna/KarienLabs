#!/usr/bin/env bash
# Housekeeping for the Docker host: removes stopped containers, dangling
# images, unused networks, and build cache older than a threshold. Safe to
# run on a schedule (weekly cron) — never touches named volumes (mongo-data,
# redis-data), so it can't accidentally delete real data.
#
# Usage: ./cleanup-docker.sh
set -euo pipefail

echo "[cleanup] Removing stopped containers ..."
docker container prune -f

echo "[cleanup] Removing dangling images ..."
docker image prune -f

echo "[cleanup] Removing unused networks ..."
docker network prune -f

echo "[cleanup] Pruning build cache older than 168h (7 days) ..."
docker builder prune -f --filter "until=168h"

echo "[cleanup] Current disk usage:"
docker system df

echo "[cleanup] Done. Named volumes (mongo-data, redis-data) were left untouched."
