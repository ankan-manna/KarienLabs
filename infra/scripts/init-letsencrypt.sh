#!/usr/bin/env bash
# One-time bootstrap for Let's Encrypt certificates, following the standard
# certbot-webroot pattern: request a cert using nginx's already-running HTTP
# listener to serve the ACME challenge (see conf.d/ssl.conf.example's
# /.well-known/acme-challenge/ location), then reload nginx to pick it up.
# Renewal afterward is handled by the "certbot" service's built-in renew loop
# (see docker-compose.prod.yml) — this script is only for the FIRST issuance.
#
# Usage: DOMAIN=medcommerce.example.com EMAIL=admin@medcommerce.example.com \
#        ./init-letsencrypt.sh
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. medcommerce.example.com}"
: "${EMAIL:?Set EMAIL for certificate renewal and expiry notices}"
STAGING="${STAGING:-0}" # set STAGING=1 first to test against LE's staging CA (avoids rate limits while debugging)

cd "$(dirname "${BASH_SOURCE[0]}")/../.."   # repo root
CERTS_DIR="infra/nginx/certs"
WEBROOT_DIR="infra/nginx/certbot-webroot"

mkdir -p "${CERTS_DIR}" "${WEBROOT_DIR}"

STAGING_ARG=""
if [[ "${STAGING}" == "1" ]]; then
  echo "[init-letsencrypt] STAGING mode — issuing a non-trusted test certificate."
  STAGING_ARG="--staging"
fi

echo "[init-letsencrypt] Requesting certificate for ${DOMAIN} ..."
docker run --rm \
  -v "$(pwd)/${CERTS_DIR}:/etc/letsencrypt" \
  -v "$(pwd)/${WEBROOT_DIR}:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot --webroot-path=/var/www/certbot \
    ${STAGING_ARG} \
    --email "${EMAIL}" --agree-tos --no-eff-email \
    -d "${DOMAIN}"

echo "[init-letsencrypt] Certificate issued at ${CERTS_DIR}/live/${DOMAIN}/"
echo "[init-letsencrypt] Now: cp infra/nginx/conf.d/ssl.conf.example infra/nginx/conf.d/ssl.conf, edit the domain, then reload nginx:"
echo "  docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml exec nginx nginx -s reload"
