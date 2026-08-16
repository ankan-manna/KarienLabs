#!/usr/bin/env bash
# Restores a MongoDB backup produced by backup-mongo.sh. Destructive by
# default (mongorestore --drop replaces existing collections) — requires an
# explicit --yes flag so it can never run unattended by accident.
#
# Usage: MONGO_URI=... ./restore-mongo.sh <path-to-archive.gz> --yes
set -euo pipefail

: "${MONGO_URI:?MONGO_URI must be set}"
ARCHIVE="${1:?Usage: restore-mongo.sh <archive.gz> --yes}"
CONFIRM="${2:-}"

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "[restore-mongo] Archive not found: ${ARCHIVE}" >&2
  exit 1
fi

if [[ "${CONFIRM}" != "--yes" ]]; then
  echo "[restore-mongo] This will DROP and REPLACE existing collections in the target database."
  echo "[restore-mongo] Re-run with --yes to confirm: $0 ${ARCHIVE} --yes"
  exit 1
fi

echo "[restore-mongo] Restoring ${ARCHIVE} into $(echo "${MONGO_URI}" | sed -E 's#(mongodb(\+srv)?://)[^@]+@#\1***:***@#') ..."
mongorestore --uri="${MONGO_URI}" --archive="${ARCHIVE}" --gzip --drop

echo "[restore-mongo] Restore complete. Verify with: mongosh \"\$MONGO_URI\" --eval 'db.getCollectionNames()'"
