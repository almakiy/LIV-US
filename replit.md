# LIV on Replit

Run command: `npm start` (starts `src/server.js`). The server listens on the port in `PORT` (default 3000) and runs the database migration on start.

Node 20 or later. Database: PostgreSQL, given by `DATABASE_URL`.

## Secrets (names only; values are set in Replit Secrets, never in the repository)
Required before the app starts in production:
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: signs the session cookie.
- `CERT_HMAC_SECRET`: signs certificate verification records.

Recommended:
- `TOTP_ENCRYPTION_KEY`: encrypts two-factor secrets (if not set, it is derived from `CERT_HMAC_SECRET`).
- `BASE_URL` or `PUBLIC_BASE_URL`: public address of the site.
- `SMTP_URL`: mail server, once a provider is chosen.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: payments, only when billing is live.

First run only:
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: create the first administrator.
- `ADMIN_RESET_PASSWORD`: remove before launch.

## Configuration (not secrets)
- `PUBLIC_APPLY`, `PUBLIC_FEES`: keep `false` until the owner approves.
- `INDIVIDUAL_ACCOUNTS`: keep `false` until the individual terms and privacy notice are approved (opens public sign-up for individuals).
- `EMAIL_DRIVER`, `EMAIL_FROM`.
- `AUTH_DOC_TEMPLATE_APPROVED`: `true` only after the authorization document template is approved.
- `REQUIRE_2FA`: `admin` or `all`.
- `BRAND_NAME`, `BRAND_LONG_NAME`, `LEGAL_ENTITY`, `LEGAL_ADDRESS`.

## Before launch
Remove `ADMIN_RESET_PASSWORD` and turn on two-step sign-in for the administrator account.
