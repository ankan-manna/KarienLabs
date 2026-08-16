#!/usr/bin/env bash
# Rolling deploy for the Docker Compose production stack: builds/pulls the new
# images, brings them up alongside the running stack (compose's default
# `up -d` recreates changed services one at a time, not all-at-once), waits
# for health checks, and rolls back automatically if the post-deploy
# healthcheck fails. Run this ON THE SERVER (or from CI over SSH — see
# .github/workflows/ci-cd.yml's `deploy` job).
#
# Usage: ./deploy.sh [image-tag]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."   # repo root
COMPOSE_FILES="-f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml"
IMAGE_TAG="${1:-latest}"
ENV_FILE="${ENV_FILE:-.env.production}"

echo "[deploy] Deploying tag '${IMAGE_TAG}' using ${ENV_FILE}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[deploy] ${ENV_FILE} not found on this host — aborting." >&2
  exit 1
fi

# Record the currently-running image digests so rollback.sh can restore them
# if this deploy fails its healthcheck.
mkdir -p infra/docker/volumes/.deploy-history
PREV_STATE_FILE="infra/docker/volumes/.deploy-history/previous-images.env"
docker compose ${COMPOSE_FILES} --env-file "${ENV_FILE}" images --format json 2>/dev/null \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const rows=JSON.parse(d);for(const r of rows)console.log(\`\${r.Service.toUpperCase()}_IMAGE=\${r.Repository}:\${r.Tag}\`)}catch{}})" \
  > "${PREV_STATE_FILE}" || true
echo "[deploy] Recorded previous image state to ${PREV_STATE_FILE}"

echo "[deploy] Pulling / building images ..."
IMAGE_TAG="${IMAGE_TAG}" docker compose ${COMPOSE_FILES} --env-file "${ENV_FILE}" build --pull

echo "[deploy] Recreating changed services ..."
IMAGE_TAG="${IMAGE_TAG}" docker compose ${COMPOSE_FILES} --env-file "${ENV_FILE}" up -d --remove-orphans

echo "[deploy] Waiting for containers to report healthy ..."
sleep 5
BASE_URL="${BASE_URL:-http://localhost}" ./infra/scripts/healthcheck.sh || {
  echo "[deploy] Healthcheck failed — rolling back." >&2
  ./infra/scripts/rollback.sh
  exit 1
}

echo "[deploy] Pruning dangling images from the previous build ..."
docker image prune -f --filter "label=com.medcommerce.project=medcommerce" >/dev/null 2>&1 || true

echo "[deploy] Deploy successful (tag: ${IMAGE_TAG})."
