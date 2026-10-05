# LIV — Leading Institute of Verification
## Phase 1 Architecture & Structure (MVP)

| | |
|---|---|
| **Brand** | LIV — Leading Institute of Verification |
| **Legal entity** | LIV LLC (Virginia, USA) |
| **Product** | B2B training-provider accreditation, certificate issuance (PDF + QR), public verification |
| **Phase** | 1 (MVP) — complete, tested locally |
| **Document date** | October 4, 2026 |

---

## 1. Purpose & Scope

LIV accredits training providers. Accredited providers issue certificates for their trainees through LIV, and anyone (employers, HR, regulators) can verify those certificates instantly by ID or QR code.

**Phase 1 delivers:**
- Public marketing and verification website (US identity, English only, LTR)
- Provider portal: CSV issuance wizard, records, templates, settings, API keys
- Super-admin console: approve and suspend providers, revoke certificates, audit log, inbox
- REST API v1: issuance, retrieval, revocation, public verification
- Tamper-evident certificate PDFs with signed QR codes
- Brand system: seal, logos, palette, typography

**Out of scope for Phase 1:** see §14 (Phase 2 backlog).

---

## 2. Brand System

| Element | Value |
|---|---|
| Short name | **LIV** |
| Long name | **Leading Institute of Verification** |
| Legal line | "LIV, Leading Institute of Verification and the LIV seal are trade names and marks of LIV LLC." |
| Disclaimer | "LIV is a private accreditation organization and is not a U.S. government agency." |
| Primary color | Navy `#0B1F3A` |
| Accent | Gold `#B08D4C` · Light Gold `#D4B97A` |
| Background | Ivory `#F7F6F2` |
| Display / seal font | Cinzel Bold |
| Headings / certificate body | Libre Baskerville |
| UI text | Inter |
| Conventions | US English, MM/DD/YYYY dates in tables, long dates on certificates ("September 21, 2026"), Eastern Time (ET) timestamps, US Letter landscape certificates |

**Brand assets** (`public/brand/`, `assets/brand/`):
- **Seal variants:** color, reverse (dark backgrounds), mono-navy, mono-white, gold.
- **Lockups:** horizontal and horizontal reverse; nav and nav reverse.
- **Favicon:** SVG and PNG.
- **Format:** every mark is pure vector, with text converted to outlines so no fonts are needed.
- **Seal anatomy:**
  - Outer navy ring with "LEADING INSTITUTE OF VERIFICATION" on top and "ACCREDITATION" below.
  - Gold inner ring around a white field.
  - "LIV" monogram in Cinzel, with three gold stars above it and a gold rule below.

**All fonts:** SIL Open Font License and self-hosted, so the site makes no external requests.

---

## 3. Technology Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Web framework | Express 5 |
| Views | EJS (server-rendered, no build step) |
| Database | PostgreSQL 14+ (`pgcrypto`) |
| Sessions | `express-session` + `connect-pg-simple` (stored in Postgres) |
| PDF | PDFKit (embedded WOFF fonts + PNG seal) |
| QR | `qrcode` |
| CSV | `csv-parse` |
| Uploads | `multer` (memory storage, size-limited) |
| ZIP export | `archiver` v7 |
| Security | `helmet` (CSP), `express-rate-limit`, `bcryptjs` |
| Tests | Playwright end-to-end (43 checks) |
| Deploy | Dockerfile + docker-compose (app + Postgres) |

---

## 4. Repository Structure

```
liv-cert/
├── src/
│   ├── server.js            # HTTP entry point
│   ├── app.js               # Express app: helmet/CSP, sessions, CSRF, locals, routers, errors
│   ├── config.js            # Env config (brand, secrets, base URL, storage)
│   ├── db.js                # pg Pool, query + transaction helpers, DATE→string parser
│   ├── lib/
│   │   ├── crypto.js        # Cert numbers, HMAC signing, QR token, API keys, hashing
│   │   ├── issuance.js      # CSV/API row validation, auto-mapping, transactional issuance
│   │   ├── pdf.js           # Certificate rendering (Classic / Modern), US date helpers
│   │   ├── verify.js        # Verification + integrity check + public projection
│   │   ├── guards.js        # Auth/role guards, rate limiters, async wrapper, flash
│   │   └── audit.js         # Audit-log writer
│   └── routes/
│       ├── public.js        # Marketing, verify, apply, contact, logos, sample CSV
│       ├── auth.js          # Login / logout
│       ├── portal.js        # Provider portal
│       ├── admin.js         # Super-admin console
│       └── api.js           # REST API v1
├── views/
│   ├── partials/            # head, foot, app shell, flash, status badge, logo
│   ├── public/              # home, about, accreditation, verify-search, verify-result, apply, contact, login
│   ├── portal/              # dashboard, issue-upload/map/review, batch, certificates, certificate, templates, settings, api-docs
│   ├── admin/               # dashboard, platforms, platform, certificates, audit, messages
│   └── error.ejs
├── public/                  # style.css, app.js, brand/ (SVG), fonts/ (WOFF2)
├── assets/                  # Server-side PDF assets: brand/ (PNG seal), fonts/ (WOFF)
├── src/schema.js            # Full schema as SQL (idempotent; applied by npm run migrate)
├── scripts/                 # migrate.js, seed.js
├── tests/e2e.js             # Playwright end-to-end suite
├── docs/                    # This document
├── storage/                 # Runtime: pdfs/, logos/, tmp/ (persistent volume in prod)
├── Dockerfile · docker-compose.yml · .env.example · README.md
```

---

## 5. Roles & Access Model

| Role | Scope | Can |
|---|---|---|
| **Public visitor** | Anonymous | View the site, verify certificates, apply, contact |
| **Platform admin** | Exactly one provider (`platform_id`) | Manage own profile, templates, users, API keys; issue certificates **only when status = active**; revoke own certificates |
| **Super admin** (LIV staff) | Global | Approve, suspend or reactivate providers; revoke any certificate; view audit log, messages, analytics |
| **API client** | One provider via API key | Issue, list, read and revoke own certificates |

Every portal query is scoped to `req.user.platform_id`. Platform admins get HTTP 403 on `/admin`.

---

## 6. Sitemap & Routes

### 6.1 Public site
| Route | Purpose |
|---|---|
| `GET /` | Home: hero with certificate search, seal, value band, how it works, audiences |
| `GET /verify` | Verification search (ID, plus last name optionally); validates ID format |
| `GET /verify/:cert?t=` | **Verification result (QR landing page)** |
| `GET /verify/:cert/pdf?t=` | Original PDF download (QR token required) |
| `GET /accreditation` | Program, benefits, process, standards alignment and non-endorsement disclaimer |
| `GET /about` | Name meaning (Leading · Institute · Verification), mission, leadership, legal line |
| `GET, POST /apply` | Accreditation application → creates a pending provider and its admin account |
| `GET, POST /contact` | Contact form → admin inbox |
| `GET /sample.csv` | Issuance CSV template |
| `GET /logo/:platformId` | Provider logo (shown on verification pages) |
| `GET, POST /login` · `POST /logout` | Authentication |

### 6.2 Provider portal (`/portal`)
| Route | Purpose |
|---|---|
| `GET /` | Dashboard: issued, valid, expiring (30 days), revoked, trainees, verification checks, recent batches |
| `GET /issue` → `POST /issue/upload` | Step 1: choose template and upload CSV (≤5,000 rows, ≤5 MB) |
| `GET, POST /issue/map` | Step 2: column mapping (headers matched automatically) |
| `GET /issue/review` | Step 3: row validation preview with errors |
| `POST /issue/confirm` · `POST /issue/cancel` | Step 4: issue (optionally skipping invalid rows) or cancel |
| `GET /batches/:id` (+ `/results.csv`, `/pdfs.zip`) | Batch results and exports |
| `GET /certificates` | Records: search, status filter, pagination |
| `GET /certificates/:num` (+ `/pdf`) · `POST …/revoke` | Detail, download, revoke (reason required) |
| `GET /templates`, `GET /templates/:id`, `POST /templates`, `POST /templates/preview` | Template management with live PDF preview |
| `GET /settings` + `POST /settings/{profile,logo,users,keys,keys/:id/revoke}` | Profile, logo, users, API keys |
| `GET /api-docs` | API documentation with the provider's own template IDs |

### 6.3 Super admin (`/admin`)
| Route | Purpose |
|---|---|
| `GET /` | Overview: pending, active, certificates, messages, 30-day verification chart, recent activity |
| `GET /platforms`, `GET /platforms/:id`, `POST /platforms/:id/status` | Provider list and detail; approve, suspend, reactivate |
| `GET /certificates`, `POST /certificates/:num/revoke` | Global search and revocation |
| `GET /audit` | Audit log |
| `GET /messages`, `POST /messages/:id/handled` | Contact inbox |

### 6.4 REST API v1 (`/api/v1`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/verify/:cert?t=` | Public | Returns result + public certificate fields (no email) |
| POST | `/certificates` | `X-API-Key` | Single, array, or `{template_id, certificates[]}`, max 500. All-or-nothing validation (422). `Idempotency-Key` supported |
| GET | `/certificates?limit&offset` | `X-API-Key` | Own certificates |
| GET | `/certificates/:num` | `X-API-Key` | Own certificate |
| POST | `/certificates/:num/revoke` | `X-API-Key` | `{ "reason" }` |

**Error codes:**
- `400` bad request
- `401` missing or invalid key
- `403` provider not active
- `404` not found
- `409` duplicate or idempotency conflict
- `422` validation failed
- `429` rate limited

---

## 7. Core Flows

### 7.1 Provider onboarding
1. The provider submits `/apply`. This creates `platforms` (pending), its first `users` record (platform_admin), and a default template.
2. The provider can log in and configure profile, logo and templates. Issuance stays blocked.
3. A super admin approves the provider (status set to active, audit logged), and issuance unlocks.

### 7.2 CSV issuance
1. **Upload:** the provider picks a template and a CSV file. The file is parsed (BOM-safe, trimmed) and the job is stored in `storage/tmp/{token}.json`.
2. **Map:** headers are matched automatically through synonyms ("Surname" becomes `last_name`, "Score" becomes `grade`, and so on). Required fields must be mapped.
3. **Validate:** each row is checked for:
   - required fields
   - email format
   - dates (`YYYY-MM-DD` or `MM/DD/YYYY`; not in the future; not before 1990)
   - field lengths
   - duplicates within the file
   - an existing active certificate for the same email, course and date
4. **Issue:** one database transaction per batch. For each row the system:
   - creates or updates the trainee
   - generates a certificate number
   - computes the HMAC
   - renders the PDF and writes it to disk
   - inserts the certificate
   - writes an audit entry

   If anything fails, the whole batch rolls back and any written PDFs are deleted.
5. **Results:** the batch page offers a results CSV (with formula-injection guard) and a ZIP of all PDFs.

### 7.3 Public verification
1. A visitor scans the QR code (`/verify/{ID}?t={token}`) or searches by ID, optionally with last name.
2. The system looks up the certificate, then recomputes the HMAC from the stored fields and compares it (constant-time) with the stored hash. If the QR token is present, it must match too.
3. The resulting status takes the first match in this order: **TAMPERED**, then **REVOKED**, then **EXPIRED**, otherwise **VALID**. **NOT FOUND** applies when no certificate matches.
4. Each lookup is logged (hashed IP, result, channel).

### 7.4 Revocation
Revocation is available from the portal, the admin console or the API. It sets `status='revoked'`, `revoked_at`, `revoked_by` and `revocation_reason`, and writes an audit entry. Certificates are **never deleted**.

---

## 8. Data Model (PostgreSQL)

| Table | Key columns | Notes |
|---|---|---|
| `platforms` | id, company_name, website, contact_email, country, logo_path, primary_color, accreditation_status (`pending`/`active`/`suspended`) | B2B providers |
| `users` | id, platform_id, role (`super_admin`/`platform_admin`), full_name, email (unique), password_hash, last_login_at | A CHECK constraint ties role to platform_id |
| `api_keys` | id, platform_id, label, prefix, key_hash (SHA-256, unique), last_used_at, revoked_at | Plaintext key shown once, never stored |
| `trainees` | id, platform_id, email, first_name, last_name | UNIQUE (platform_id, email): scoped per provider |
| `certificate_templates` | id, platform_id, name, design (`classic`/`modern`), signatory_name/title, validity_months | |
| `issuance_batches` | id, platform_id, created_by, source (`csv`/`api`), file_name, total_rows, issued, skipped, idempotency_key | UNIQUE (platform_id, idempotency_key) |
| `certificates` | id, cert_number (unique), platform_id, trainee_id, **recipient_first/last_name, recipient_email** (immutable snapshot), template_id, batch_id, course_name, grade, completion_date, issue_date, expiry_date, pdf_path, verification_hash, status, revoked_at/by, revocation_reason | Partial unique index blocks duplicate active certificates |
| `verification_logs` | cert_number, certificate_id, result, ip_hash, channel, created_at | Analytics and abuse monitoring |
| `audit_logs` | actor_user_id, actor_label, platform_id, action, target, metadata (JSONB), created_at | Every sensitive action |
| `contact_messages` | name, email, topic, message, handled | Admin inbox |
| `sessions` | (auto-created by connect-pg-simple) | |

**Expiry rule:** `expiry_date` is the completion date plus the template's `validity_months`. When `validity_months` is blank, the certificate never expires.

---

## 9. Certificate Design

- **Size:** US Letter landscape (792 × 612 pt).
- **Classic design:**
  - Navy outer border with a gold inner rule; provider logo or name at the top.
  - "Certificate of Completion" title in Cinzel; recipient name and course in Libre Baskerville.
  - Completion date, grade and "valid until" date.
  - QR code with "Scan to verify" and the certificate ID; signatory line with "Issued" date.
  - **LIV seal** with "ACCREDITED BY LIV".
- **Modern design:** navy side panel with the title and QR code; a sans-serif body with a metadata row; signatory, seal and the verification URL.
- **Branding:** the provider's brand color drives accent elements. The LIV seal stays constant.

---

## 10. Security Design

| Control | Implementation |
|---|---|
| Certificate ID | `LIV-YYYY-XXXXXXXX`, 8 random characters from a 31-character unambiguous alphabet (not sequential) |
| Integrity | HMAC-SHA256 (`CERT_HMAC_SECRET`) over the versioned canonical string: number, platform, recipient snapshot, course, grade, dates |
| QR token | First 16 hex characters of the HMAC; forged or missing-token PDFs are rejected |
| Passwords | bcrypt (cost 12), constant-time login against a dummy hash |
| Sessions | httpOnly, SameSite=Lax, Secure in production, 8-hour lifetime, regenerated on login |
| CSRF | Synchronizer token on every form (multipart forms checked after multer) |
| Headers | Helmet with strict CSP (`script-src 'self'`, no third-party origins) |
| Rate limits | Verify 30/min; login 20 per 15 min; apply 10 per 15 min; contact 5 per 15 min; API 120/min; public verify API 60/min |
| Privacy | No search by name alone; trainee email never shown publicly; IPs stored only as salted hashes |
| Uploads | CSV ≤ 5 MB; logo ≤ 1 MB, PNG/JPEG checked by file signature |
| Exports | CSV formula-injection guard |
| Tenancy | Every portal and API query is filtered by platform |

---

## 11. Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `SESSION_SECRET` | Session signing (required in production) |
| `CERT_HMAC_SECRET` | **Certificate signing. Never change after go-live; back it up** |
| `BASE_URL` | Public domain printed into QR codes (set before real issuance) |
| `PORT`, `NODE_ENV` | Runtime |
| `STORAGE_DIR` | PDFs, logos, temp jobs (persistent volume) |
| `BRAND_NAME` / `BRAND_LONG_NAME` / `LEGAL_ENTITY` | `LIV` / `Leading Institute of Verification` / `LIV LLC` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial super admin |

---

## 12. Testing & Quality Status

- **End-to-end suite:** `tests/e2e.js` (Playwright) makes **43 checks, all passing** on a clean database. It covers:
  - CSV issuance end to end, including auto-mapping, every validation rule, the skip-invalid flow and cross-batch duplicates
  - CSV and ZIP exports, with the formula-injection guard
  - Verification: valid, forged QR token, wrong last name, case-insensitive lookup, PDF token requirement, tamper detection through direct database edits
  - Revocation from the portal and the API
  - API keys shown once; API issuance, idempotent replay and 422 validation
  - The public verify API, which leaks no email
  - Apply, then pending, then approval by super admin
  - CSRF rejection, role isolation and 404 on foreign resources
- **Visual QA:** desktop (1280 px) and mobile (390 px), with no horizontal scroll.

---

## 13. Pre-Launch Checklist (before real use)

**Legal / compliance**
- [ ] **File a Virginia Certificate of Assumed or Fictitious Name** with the SCC (Va. Code § 59.1-69) for **"Leading Institute of Verification"** and **"LIV"**. The fee is $10 each, it can be filed online, and it needs no renewal. Without it, operating under these names is a misdemeanor (§ 59.1-75), and LIV LLC can't sue in Virginia courts until it is filed (§ 59.1-76).
- [ ] USPTO trademark clearance for "LIV" and "Leading Institute of Verification" (Classes 41/42). A US education business named "LIV Institute" already exists.
- [ ] Legal review of the accreditation wording, Terms of Service, Privacy Policy and accreditation agreement.
- [ ] Never describe LIV as a "college" or "university"; don't deliver courses under the LIV name in Virginia (SCHEV scope).
- [ ] Fill in the About page placeholders: leadership names and registered address.
- [ ] **Accuracy of claims:** the website and every certificate state that LIV reviews partners' trainers, curricula and training methods and audits them periodically. Do not publish or issue until that process actually exists (written criteria, review records, audit schedule); misleading accreditation claims create consumer-protection exposure (FTC Act §5 and state laws). Counsel should approve the disclaimers (not a government agency; not recognized by the U.S. Department of Education or CHEA; no guarantee of individual competence) and the use of third-party names (ISO, ANSI, OSHA, CQI, IRCA).

**Technical**
- [ ] Generate and vault `SESSION_SECRET` and `CERT_HMAC_SECRET`, with an offline backup of the HMAC secret.
- [ ] Set `BASE_URL` to the production domain.
- [ ] HTTPS behind a reverse proxy; `NODE_ENV=production`.
- [ ] Persistent volume, or S3/R2, for `storage/`.
- [ ] Automated PostgreSQL backups.
- [ ] Change the seed credentials and remove the demo provider.

---

## 14. Phase 2 Backlog (proposed)

1. **Trainee email delivery:** certificate email with PDF and verify link; transactional provider (e.g., Postmark or SES).
2. **Password reset and 2FA** (TOTP) for super admins and provider admins.
3. **Accreditation scope:** per-course or per-program approval, so a provider can issue only for accredited courses.
4. **Application workflow:** document uploads, reviewer notes, conditions, renewal dates, annual re-accreditation reminders.
5. **Billing:** per-certificate or subscription pricing through Stripe (via LIV LLC); invoices.
6. **Object storage:** S3/R2 for PDFs and logos; signed URLs.
7. **Public provider directory:** "Find an accredited provider" with accreditation status.
8. **Webhooks:** notify provider systems on issuance and revocation.
9. **Wallet and badges:** Open Badges 3.0 / verifiable credentials export; Add to Apple/Google Wallet.
10. **Bulk revoke and reissue:** reissue with corrected data while linking to the original record.
11. **Observability:** structured logs, error tracking, uptime monitoring, verification-abuse alerts.
12. **Legal pages:** Terms, Privacy, Accreditation Policy, Complaints & Appeals procedure.
