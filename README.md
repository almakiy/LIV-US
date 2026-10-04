# LIV — Leading Institute of Verification

The accreditation and certificate-verification platform of **LIV**, operated by LIV LLC (United States).

LIV uses this B2B platform to accredit training providers. Accredited providers issue tamper-evident certificates (a PDF with a QR code) by CSV upload or REST API. Anyone can check a certificate on the public verification portal.

**Stack:** Node.js 20+ · Express · PostgreSQL 14+ · EJS (server-rendered, no build step) · PDFKit · qrcode

## Quick start (local)

```bash
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET, CERT_HMAC_SECRET, BASE_URL
npm install
npm run migrate               # creates tables
npm run seed                  # super admin + demo platform + 3 sample certificates
npm start                     # http://localhost:3000
```

Seed logins (change them right away):

| Role | Email | Password |
|---|---|---|
| Super admin (LIV) | `admin@liv.local` (or `SEED_ADMIN_EMAIL`) | `ChangeMe-Admin-2026` (or `SEED_ADMIN_PASSWORD`) |
| Demo provider (active) | `demo@trainingco.example` | `ChangeMe-Demo-2026` |

## Docker

```bash
cp .env.example .env   # fill in the secrets and BASE_URL
docker compose up -d --build
docker compose exec app node scripts/seed.js
```

## Brand
- **Name:** LIV, short for **Leading Institute of Verification**. Set with `BRAND_NAME`, `BRAND_LONG_NAME` and `LEGAL_ENTITY`.
- **Seal and logos:** `public/brand/` (SVG) and `assets/brand/` (PNG for certificates). All text in the marks is converted to vector paths, so they need no fonts installed.
- **Colors:** Navy `#0B1F3A`, Gold `#B08D4C`, Light Gold `#D4B97A`, Ivory `#F7F6F2`.
- **Type:**
  - Libre Baskerville for headings and certificates
  - Cinzel for the seal and certificate titles
  - Inter for UI text
- **Fonts:** all self-hosted under the SIL Open Font License, with no external requests.
- **US conventions:** English only (LTR), US Letter certificates, MM/DD/YYYY dates in tables, and timestamps in Eastern Time.

## What's included

### Public site
- **Home:** search by certificate ID, links to verify or apply, a how-it-works section and trust indicators.
- **Verify** (`/verify`): search by certificate ID, optionally with the holder's last name. You can't search by name alone, which protects trainees' privacy. Lookups are rate-limited to 30 per minute per IP.
- **Verification page** (`/verify/{ID}?t={token}`): this is where the QR code lands.
  - Status banner: VALID, EXPIRED, REVOKED, INVALID (tampered), or NOT FOUND.
  - Certificate details, the issuer's logo and its accreditation status.
  - Download the original PDF, add the certificate to a LinkedIn profile, or copy the link.
  - The trainee's email is never shown.
- **Accreditation:** benefits, the four-step process, and standards alignment with a non-endorsement disclaimer.
- **About**, **Contact** (messages are saved to the admin inbox), and **Apply** (creates a pending platform and its admin account).

### Client portal (training providers)
- **Dashboard:** totals for issued, valid, expiring in 30 days and revoked; trainee count; verification checks; recent batches.
- **Issuance Center wizard:**
  1. Choose a template and upload a CSV.
  2. Map columns. Common header names are matched automatically ("Surname" becomes `last_name`, "Score" becomes `grade`, and so on).
  3. Review and validate. Each row is checked for missing fields, invalid email, invalid, future or very old dates, duplicates within the file, and certificates already issued.
  4. Issue, either all rows or only the valid ones. Then download a results CSV and a ZIP of all PDFs.
- **History & records:** search, filter (valid, expiring, expired, revoked), pagination, and a detail page with revocation (a reason is required and every revocation is logged).
- **Templates:** Classic or Modern design, signatory, and a validity period in months. A PDF preview button shows the result before saving.
- **Settings:** company profile, brand color, logo (PNG or JPEG, checked by file signature), users, and API keys (shown once, stored as a SHA-256 hash, revocable).
- **API docs** page, with your own template IDs filled in.

### Super admin (LIV)
- Overview with a 30-day chart of verification lookups, including failed ones.
- Approve, suspend or reactivate platforms. A suspended platform can't issue, but its existing certificates still verify and show the provider as suspended.
- Search all certificates and revoke any of them, an audit log viewer, and the contact inbox.

### REST API (`/api/v1`, header `X-API-Key`)
| Method | Path | Notes |
|---|---|---|
| POST | `/certificates` | Accepts one object, an array, or `{template_id, certificates:[…]}` (max 500). All-or-nothing validation returns 422 on failure. Supports an `Idempotency-Key` header. |
| GET | `/certificates` | `limit`, `offset` |
| GET | `/certificates/{cert_number}` | |
| POST | `/certificates/{cert_number}/revoke` | `{ "reason": "…" }` |
| GET | `/verify/{cert_number}` | Public, no key. Returns no email. |

## Security design
- **Certificate ID:** `LIV-YYYY-XXXXXXXX`, 8 random characters from an unambiguous 31-character alphabet. IDs are not sequential and can't be guessed.
- **Integrity:** an HMAC-SHA256, signed with `CERT_HMAC_SECRET`, covers the recipient snapshot, course, grade and dates. Each verification recomputes it, so any edit made directly in the database shows as **INVALID**. The QR code carries a 16-hex-character token taken from that HMAC, so a forged QR code fails as well.
- **Immutable records:** certificates store a snapshot of the recipient's details. They are never deleted, only revoked.
- **Passwords:** bcrypt with cost 12, plus constant-time login so attackers can't tell which emails exist.
- **Sessions:** stored in PostgreSQL, with httpOnly, SameSite=Lax cookies (Secure in production).
- **Every form is CSRF-protected**, and the app sends Helmet security headers including a strict CSP.
- **Rate limits:** verification, login, apply, contact and the API.
- **CSV exports** guard against formula injection.
- **Data scoping:** every query in the portal is filtered by the user's own platform.

## Tests
With the server running and the database seeded:
```bash
npm i -D playwright
CHROMIUM_PATH=/path/to/chrome node tests/e2e.js http://localhost:3000 ./screenshots
```
The test suite makes 43 checks. They cover CSV issuance end to end, every validation rule, the ZIP and CSV exports, the QR, tamper and last-name checks, revocation, API keys, API issuance and idempotency, the apply-and-approve flow, CSRF and access control.

## Before production
1. **`CERT_HMAC_SECRET`:** generate it once, store it in a secrets manager and back it up. If it's lost or changed, every certificate already issued will fail verification.
2. **`BASE_URL`:** set it to the final domain *before* issuing real certificates. The URL is printed into each QR code.
3. **Storage:** PDFs and logos are kept on disk (`STORAGE_DIR`). Use a persistent volume, or switch to S3 or R2 for multi-instance hosting.
4. **HTTPS:** serve the app over HTTPS, with Express's `trust proxy` setting already configured for one proxy. Session cookies are marked Secure in production.
5. **Database:** schedule PostgreSQL backups.
6. **Not built yet:**
   - Email delivery to trainees
   - Password reset
   - Two-factor authentication for admins
   - Arabic/RTL interface
   - Per-course accreditation scope
   - Invoicing
