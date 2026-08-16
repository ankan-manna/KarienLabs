#!/usr/bin/env bash
# Automatic MongoDB backup — dumps the database configured via $MONGO_URI,
# compresses it, optionally ships it to S3, and prunes backups older than
# $BACKUP_RETENTION_DAYS. Intended to run on a schedule (cron / systemd timer /
# the "backup" service in docker-compose.prod.yml — see that file's comment).
#
# Usage: MONGO_URI=... ./backup-mongo.sh [output-dir]
set -euo pipefail

: "${MONGO_URI:?MONGO_URI must be set (see .env.production.example)}"
OUT_DIR="${1:-/var/backups/medcommerce/mongo}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_DIR="${OUT_DIR}/${TIMESTAMP}"
ARCHIVE="${OUT_DIR}/medcommerce-${TIMESTAMP}.gz"

mkdir -p "${OUT_DIR}"

echo "[backup-mongo] Dumping database to ${DUMP_DIR} ..."
mongodump --uri="${MONGO_URI}" --archive="${ARCHIVE}" --gzip

echo "[backup-mongo] Wrote $(du -h "${ARCHIVE}" | cut -f1) archive: ${ARCHIVE}"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[backup-mongo] Uploading to s3://${BACKUP_S3_BUCKET}/mongo/$(basename "${ARCHIVE}") ..."
  aws s3 cp "${ARCHIVE}" "s3://${BACKUP_S3_BUCKET}/mongo/$(basename "${ARCHIVE}")" --storage-class STANDARD_IA
fi

echo "[backup-mongo] Pruning local backups older than ${RETENTION_DAYS} days ..."
find "${OUT_DIR}" -maxdepth 1 -name "medcommerce-*.gz" -mtime "+${RETENTION_DAYS}" -print -delete

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[backup-mongo] Remote retention is enforced via the bucket's S3 Lifecycle rule (see infra/scripts/README notes in backup-mongo.sh header) — configure a ${RETENTION_DAYS}-day expiration on the mongo/ prefix in the S3 console/Terraform, not here, since a local script re-scanning a remote bucket on every run doesn't scale."
fi

echo "[backup-mongo] Done."
