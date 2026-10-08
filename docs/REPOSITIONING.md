# LIV — Institutional repositioning (slice 1)

Status (October 8, 2026): slice 1 of the Master Implementation Brief is built and tested. The brief received was cut off in section 6 (after "Leadership and"); sections 6 onward are not yet implemented beyond the HSE Governance outline below.

## 1. Audit of the platform before the change
| Area | What existed | Where |
|---|---|---|
| Brand name | Central in config (`BRAND_NAME`, `BRAND_LONG_NAME`), default "Leading Institute of Verification" | `src/config.js` |
| Seal and logos | SVG with all text outlined as paths ("LEADING INSTITUTE OF VERIFICATION" / "ACCREDITATION"); PNG copies embedded in PDFs | `public/brand/`, `assets/brand/` |
| Public base URL | `BASE_URL`, already used by QR codes, verification links, sitemap, RSS and robots | `src/config.js`, `src/routes/knowledge.js`, `src/lib/issuance.js` |
| Public model | "LIV accredits education partners"; pages Home, About, Accreditation, Fees, Verify, Knowledge, Apply, Contact | `views/public/*` |
| Certificate | "CERTIFICATE OF COMPLETION", header "ACCREDITATION ORGANIZATION", seal caption "ACCREDITED BY LIV", note "...an accredited education partner" | `src/lib/pdf.js` |
| Partner status | Column `platforms.accreditation_status` (pending, active, suspended...) used across portal, admin, API, QMS, billing | many files, see `LEGACY-NAMING.md` |
| Record types | One type only: a completion certificate issued on a partner's completion report | `certificates` table |

## 2. What changed in slice 1
1. **Brand (locked decisions):** long name "Leadership Institute of Validation", descriptor "U.S.-Based Professional Credentialing & Verification Organization", brand line "Validate competence. Verify credentials.", Arabic rendering kept in config for institutional use (site remains English). Header strip, footer, meta description, About page.
2. **Seal and logos regenerated** from config: top "LEADERSHIP INSTITUTE OF VALIDATION", bottom "PROFESSIONAL CREDENTIALS", center LIV. Script `npm run brand` (`scripts/brand-seal.js` + `scripts/brand-png.js`) rewrites the ring text and logo name lines as outlined glyphs and re-renders the PNGs; it is idempotent.
3. **Domain readiness:** `PUBLIC_BASE_URL` (takes precedence over `BASE_URL`). Canonical link and Open Graph tags on every public page, RSS discovery link; sitemap, RSS, QR codes and verification links already used the configured base. No DNS or registrar change made.
4. **New public URLs:** `/credentials`, `/credentials/hse-governance`, `/partners`, `/partners/{slug}` (public register of authorized partners; slug derived from the name plus a short id), `/research`, `/guides`, `/standards` (knowledge filtered by kind). `/accreditation` answers 301 to `/partners`. Sitemap lists them.
5. **Terminology (public and user-facing):** Accredited provider → Authorized Education Partner; Accreditation program → Education Partner Program; Accreditation status → Authorization status; Provider login → Partner Portal; certificate → credential in verification; fee names → partner application/review/authorization; QMS review outcomes → suspend/withdraw authorization; partner agreement starter → "Authorized Education Partner Agreement".
6. **Record types made explicit:** Training Completion Credential (issued today), Professional Qualification (in development), Professional Certification (future, only when a scheme meets its requirements). The verification page now states "Record type: Training Completion Credential ... not a professional qualification or certification".
7. **Certificate PDF:** heading "CERTIFICATE / OF TRAINING COMPLETION"; header "PROFESSIONAL CREDENTIALING & VERIFICATION · VIRGINIA, UNITED STATES OF AMERICA"; "ACCREDITED BY LIV" removed (seal only); note "Issued by LIV on the basis of the completion report of an Authorized Education Partner"; legal line "private professional credentialing and verification organization ... not a government agency"; PDF metadata author is LIV LLC (was the partner).
8. **Claims:** footer, About and partner pages state that LIV is not a government agency or regulatory authority and does not claim ISO or other external accreditation or recognition.
9. **First credential family outline:** HSE Governance ("From HSE operations to HSE governance"), marked In development, with the professional focus list from the brief and a positioning line that it complements and does not replace operational HSE and management-system courses. No assessment is offered.

## 3. Deliberately not changed
- Database names (`accreditation_status`, `ACC_*` product codes, `accreditation` contact topic and fee category key): kept to avoid migration risk. See `LEGACY-NAMING.md`.
- Credentials already issued: their stored PDFs keep the wording they were issued with. Integrity checks are unaffected (the hash covers the record data, not the PDF).
- Classic and Modern certificate designs still show the partner logo or name when the partner chooses them, and fall back to the partner name when a template has no signatory. The default Executive design does neither. Decide whether to restrict these designs.
- Internal documents in `docs/` written before the change (strategy, roadmap) still use the old terms in places; they are history, not public copy.

## 4. Next slices (need the rest of the brief)
1. Credential schemes as data: scheme table (name, slug, type, competency framework, assessment requirements, status, version), partner authorized scope per scheme or course, credential type on each issued record.
2. Assessment and credential decision flow (see `EXAM-SYSTEM.md`), so Professional Qualification records can be issued only after a recorded decision.
3. Partner register details: published authorized scope, authorization dates, suspension history.
4. Knowledge authority features and HSE Governance content plan.
