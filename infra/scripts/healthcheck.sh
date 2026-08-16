#!/usr/bin/env bash
# Smoke-tests a running deployment: API health endpoint, web static serving,
# and (best-effort) DB/Redis reachability via the API's own /health response.
# Used by deploy.sh as the gate before flipping traffic, and can be run
# standalone (e.g. from CI, or a monitoring cron job that alerts on failure).
#
# Usage: BASE_URL=https://medcommerce.example.com ./healthcheck.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
API_URL="${API_URL:-${BASE_URL}/api/v1}"
MAX_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-10}"
SLEEP_SECONDS="${HEALTHCHECK_INTERVAL:-3}"

check() {
  local name="$1" url="$2" expect_status="${3:-200}"
  local attempt=1
  while (( attempt <= MAX_ATTEMPTS )); do
    status="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "${url}" || echo "000")"
    if [[ "${status}" == "${expect_status}" ]]; then
      echo "[healthcheck] OK   ${name} (${url}) -> ${status}"
      return 0
    fi
    echo "[healthcheck] wait ${name} (${url}) -> ${status} (attempt ${attempt}/${MAX_ATTEMPTS})"
    attempt=$((attempt + 1))
    sleep "${SLEEP_SECONDS}"
  done
  echo "[healthcheck] FAIL ${name} (${url}) never returned ${expect_status}" >&2
  return 1
}

failures=0
check "API health" "${BASE_URL}/health" || failures=$((failures + 1))
check "Frontend"    "${BASE_URL}/" || failures=$((failures + 1))
check "API sitemap"  "${BASE_URL}/sitemap.xml" || failures=$((failures + 1))
check "Feature flags (DB-backed)" "${API_URL}/feature-flags/active" || failures=$((failures + 1))

if (( failures > 0 )); then
  echo "[healthcheck] ${failures} check(s) failed." >&2
  exit 1
fi

echo "[healthcheck] All checks passed."
