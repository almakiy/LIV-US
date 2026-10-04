#!/usr/bin/env bash
# Runs once when the Codespace is created.
set -euo pipefail
npm ci
if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_URL=${DATABASE_URL:-postgres://liv:liv@localhost:5432/liv}
SESSION_SECRET=$(openssl rand -hex 32)
CERT_HMAC_SECRET=$(openssl rand -hex 32)
NODE_ENV=development
PORT=3000
# Set to true to open the public provider application page (/apply) and provider login.
PUBLIC_APPLY=false
# Random demo logins (the Codespace port may be shared publicly to scan QR codes from a phone)
SEED_ADMIN_EMAIL=admin@liv.local
SEED_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)Aa1
SEED_DEMO_PASSWORD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)Aa1
ENV
fi
