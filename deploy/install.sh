#!/usr/bin/env bash
# Phoenix Lead Finder — one-command installer for a fresh Ubuntu server.
#
#   sudo bash deploy/install.sh leads.example.com you@example.com
#
# It installs Docker if missing, creates .env with freshly generated secrets,
# opens the firewall for web traffic, and starts the whole stack.
# Running it again is safe: an existing .env is kept untouched.
set -euo pipefail

DOMAIN="${1:-}"
CONTACT="${2:-}"
DRY_RUN="${DRY_RUN:-0}"   # DRY_RUN=1 only writes .env (used to test this script)

if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash deploy/install.sh YOUR_DOMAIN [contact-email]"
  echo "Example: sudo bash deploy/install.sh leads.example.com you@example.com"
  exit 1
fi
if ! printf '%s' "$DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then
  echo "\"$DOMAIN\" does not look like a domain name (example: leads.example.com). Do not include https://"
  exit 1
fi
cd "$(dirname "$0")/.."
[ -f docker-compose.yml ] || { echo "Run this from inside the phoenix-lead-finder folder."; exit 1; }

if [ -f .env ]; then
  echo "==> .env already exists: keeping your current settings."
else
  echo "==> Creating .env with new random secrets"
  DB_PASS="$(openssl rand -hex 24)"
  ENC_KEY="$(openssl rand -hex 32)"
  umask 077
  cat > .env <<ENV
POSTGRES_USER=phoenix
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=phoenix
DATABASE_URL=postgresql://phoenix:${DB_PASS}@db:5432/phoenix
ENCRYPTION_KEY=${ENC_KEY}
APP_URL=https://${DOMAIN}
DOMAIN=${DOMAIN}
CRAWLER_CONTACT=${CONTACT}
ENV
  chmod 600 .env
  echo "    Saved. Keep a private copy of this file: without ENCRYPTION_KEY, saved API keys cannot be read after a restore."
fi

if [ "$DRY_RUN" = "1" ]; then echo "==> DRY_RUN: stopping before installing anything."; exit 0; fi
[ "$(id -u)" = "0" ] || { echo "Please run with sudo."; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is missing. Install Docker from https://get.docker.com and run again."; exit 1; }

if command -v ufw >/dev/null 2>&1; then
  echo "==> Opening firewall ports 22, 80, 443"
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80,443/tcp >/dev/null || true
  ufw --force enable >/dev/null || true
fi

# Small servers run out of memory while building; add 2 GB of swap if there is none.
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 1900 ] && [ "$(swapon --noheadings | wc -l)" = "0" ]; then
  echo "==> Adding 2 GB swap (low-memory server)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p backups
echo "==> Building and starting (the first build takes several minutes)"
docker compose up -d --build

echo "==> Waiting for the app to answer"
OK=0
for _ in $(seq 1 60); do
  if docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then OK=1; break; fi
  sleep 5
done
docker compose ps
if [ "$OK" = "1" ]; then
  echo
  echo "Phoenix Lead Finder is running."
  echo "Open:  https://${DOMAIN}"
  echo "The first visit asks you to create the administrator account."
  echo "If the page does not open, check that the DNS A record of ${DOMAIN} points to this server."
else
  echo
  echo "The app did not answer in time. See the logs with:  docker compose logs --tail 80 web"
  exit 1
fi
