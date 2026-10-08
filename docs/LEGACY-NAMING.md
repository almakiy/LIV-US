# Technical debt: legacy "accreditation" naming

The public language moved from accreditation to authorization and credentials (see `REPOSITIONING.md`). Internal names were kept on purpose so no data migration was needed in slice 1. Migrate them later, in one planned change with a migration and tests.

| Legacy internal name | Meaning now | Used in | Migration note |
|---|---|---|---|
| `platforms.accreditation_status` (values pending, active, suspended, ...) | Partner authorization status | schema, `app.js` session user, guards, issuance, API, admin, QMS, billing, verification, many views (`b-<status>` badges) | Rename column to `authorization_status` with a view or dual-write period; update every query and `req.user.accreditation_status` |
| `user.accreditation_status` (request object) | Same | views `app-start`, portal dashboard, issue review | Follows the column rename |
| Billing product codes `ACC_APPLICATION`, `ACC_ANNUAL`, `ACC_SCOPE_COURSE`, `ACC_SPECIAL_REVIEW`, `ACC_ONSITE_DAY`, `ACC_REINSTATE`, `ACC_APPEAL`, `ACC_ADMIN_CHANGE` | Partner application, review and authorization fees | `billing-catalog.js`, invoices already issued | Keep codes (they appear on issued invoice lines); only names changed. `LEGACY_NAMES` renames old names once |
| Billing category key `accreditation` | Education partner fees | catalog, fees page grouping | Rename key to `partner` with a data update |
| Contact topic value `accreditation` | Education partner program enquiries | contact form, messages | Rename value; update stored messages |
| `accreditationNote()` in `src/lib/pdf.js` | Issuance statement on credentials | PDF designs, unit test | Rename to `issuanceNote()` |
| QMS starter document code `LIV-PRO-005` title | Education partner authorization procedure | QMS starter set | Title updated for new installs; existing documents are controlled records and must be revised through the QMS, not edited in code |
| Table and route names `platforms`, `/admin/platforms` | Education partners | admin routes, many queries | Optional rename to `partners`; low value, high churn |
| Term "certificate" in code (`certificates` table, `cert_number`, routes `/portal/certificates`) | Credential record | everywhere | Keep: "certificate" remains correct for the Training Completion Credential document; add a `record_type` column when more types exist |
| `platforms.primary_color`, `platforms.logo_path` | Partner branding for the portal and verification record only | settings, verification page | No longer used on credentials; keep |
| `pdf-security` option `colors: 'brand'` | Now means LIV navy | templates | Rename value to `liv` with a data update |
| Env `BASE_URL` | Public base URL | config | `PUBLIC_BASE_URL` now preferred; `BASE_URL` kept as fallback |
| Docs written before Oct 8, 2026 (`GLOBAL-STRATEGY.md`, `ROADMAP.md`, `LIV-Phase1-Architecture.md`, `CREDENTIAL-MODEL.md`, `FEES.md`) | Historical design records | `docs/` | Update when each document is next revised |
