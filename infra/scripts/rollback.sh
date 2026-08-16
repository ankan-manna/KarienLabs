#!/usr/bin/env bash
# Reverts to the image tags recorded by the most recent deploy.sh run before
# it attempted to deploy a new version. Manual rollback strategy — promotes
# to Blue/Green or a proper image registry with immutable tags once traffic
# volume justifies it (see infra note in docker-compose.prod.yml).
#
# Usage: ./rollback.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."   # repo root
COMPOSE_FILES="-f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-.env.production}"
PREV_STATE_FILE="infra/docker/volumes/.deploy-history/previous-images.env"

if [[ ! -f "${PREV_STATE_FILE}" ]]; then
  echo "[rollback] No previous deploy record found at ${PREV_STATE_FILE} — nothing to roll back to." >&2
  exit 1
fi

echo "[rollback] Restoring images from ${PREV_STATE_FILE}:"
cat "${PREV_STATE_FILE}"

# shellcheck disable=SC1090
set -a; source "${PREV_STATE_FILE}"; set +a

docker compose ${COMPOSE_FILES} --env-file "${ENV_FILE}" up -d --remove-orphans

echo "[rollback] Waiting for containers to report healthy ..."
sleep 5
BASE_URL="${BASE_URL:-http://localhost}" ./infra/scripts/healthcheck.sh || {
  echo "[rollback] Healthcheck STILL failing after rollback — this needs a human. Paging on-call." >&2
  exit 1
}

echo "[rollback] Rollback successful."
