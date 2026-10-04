#!/usr/bin/env bash
# Runs on every Codespace start: migrate, seed demo data, (re)start the site.
set -euo pipefail
cd "$(dirname "$0")/.."
# QR codes and links must point at the public Codespaces URL for this port.
if [ -n "${CODESPACE_NAME:-}" ]; then
  export BASE_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  export BASE_URL="${BASE_URL:-http://localhost:3000}"
fi
npm run migrate
npm run seed
pkill -f "node src/server.js" 2>/dev/null || true
nohup node src/server.js > /tmp/liv.log 2>&1 &
echo "LIV is starting at ${BASE_URL}  (logs: /tmp/liv.log)"
echo "Logins (also in .env):"
echo "  Admin    ${SEED_ADMIN_EMAIL:-$(grep ^SEED_ADMIN_EMAIL= .env | cut -d= -f2)}  /  $(grep ^SEED_ADMIN_PASSWORD= .env | cut -d= -f2)"
echo "  Provider demo@trainingco.example  /  $(grep ^SEED_DEMO_PASSWORD= .env | cut -d= -f2)"
