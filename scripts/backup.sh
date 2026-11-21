#!/usr/bin/env bash
# Timestamped logical backup of the PIP database.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${DATABASE_URL:?DATABASE_URL not set}"
mkdir -p backups
out="backups/pip-$(date +%Y%m%d-%H%M%S).sql"
pg_dump --no-owner --no-privileges "$DATABASE_URL" > "$out"
echo "✓ Backup written to $out ($(du -h "$out" | cut -f1))"
