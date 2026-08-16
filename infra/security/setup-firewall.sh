#!/usr/bin/env bash
# One-time UFW firewall bootstrap for a fresh Ubuntu LTS production host
# (spec: "Production Server: ... Firewall"). Default-deny inbound, only the
# ports this stack actually needs are opened. Run once as root/sudo during
# server provisioning, before or after Docker is installed (order doesn't
# matter — Docker manages its own iptables rules for container port
# publishing independently of UFW's INPUT chain).
#
# Usage: sudo ./setup-firewall.sh [ssh-port]
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

SSH_PORT="${1:-22}"

command -v ufw >/dev/null || { echo "Installing ufw ..."; apt-get update -qq && apt-get install -y ufw; }

echo "[firewall] Setting default policies: deny incoming, allow outgoing"
ufw default deny incoming
ufw default allow outgoing

echo "[firewall] Allowing SSH on port ${SSH_PORT} (rate-limited against brute force)"
ufw limit "${SSH_PORT}/tcp" comment "SSH"

echo "[firewall] Allowing HTTP/HTTPS"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# Deliberately NOT opening: 5000 (API — only reachable via nginx proxy),
# 27017 (MongoDB), 6379 (Redis), 9090/3001 (Prometheus/Grafana — put behind
# nginx basic-auth or a VPN/SSH tunnel instead of exposing directly), 8081
# (mongo-express — dev-only, never runs in production per docker-compose.dev.yml).

echo "[firewall] Enabling UFW"
ufw --force enable

ufw status verbose
