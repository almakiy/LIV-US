# LIV — Product Roadmap

Direction set by the owner on October 4, 2026. This supersedes the "Phase 2 backlog" in
`LIV-Phase1-Architecture.md` where the two differ.

## Product layers

| Layer | What it is | Status |
|---|---|---|
| **1. Certification core** | US-identity site that issues certificates on behalf of other training providers; public verification page reached by scanning the signed QR code on the certificate | Built (Phase 1) |
| **2. Knowledge hub** | Content hub and publishing platform for Quality, Safety (HSE) and Project Management: articles, research, guides | Planned |
| **3. Commercial products** | Consulting, digital booklets, provider accreditation fees, per-certificate issuance fees (model: OSHAcademy) | Planned |

## Decisions that change Phase 1 scope

1. **Admin-only operation for now.** Only LIV staff operate the system. The provider application
   gateway (`/apply`) and provider self-service portal will be designed and shipped in a later
   phase. Until then, `/apply` and provider login should be hidden from public navigation, and
   providers are created by a super admin.
2. **Certificate engine** is a first-class module: themes (layouts), brand styling, and a
   **security-pattern designer** (see below). LinkedIn-style digital badges (Open Badges 3.0) come after.
3. **Verification stays the trust anchor.** The QR code encodes the signed verification URL; the
   page shows certificate and trainee data. Printed security features deter casual copying, but
   the authoritative check is always the online record.

## Certificate engine

### Themes
Today: `classic`, `modern`. Target: a theme registry where each theme declares its layout, fonts,
slots (logo, signatory, QR, seal) and which security layers it supports. Themes are chosen per
template; admin previews them live.

### Security-pattern designer (anti-counterfeiting)
Goal: raise trust and make copying a certificate harder, in the manner of accredited-body ISO
certificates. These are LIV's own designs; do not reproduce another body's marks or patterns.

Layers, each toggled and tuned per template in an admin form with live PDF preview:

| Layer | Behavior |
|---|---|
| Guilloche border / background | Fine-line pattern **generated from the certificate's HMAC**, so every certificate has a unique pattern and a single template cannot be cloned |
| Microtext | Repeated tiny text lines (certificate ID, "LIV VERIFIED") along borders and rules; blurs when photocopied |
| Ghost watermark | Large low-opacity LIV seal and/or recipient name behind the body text |
| Tiled text watermark | Diagonal repeating "LIV · Certificate ID" pattern at very low opacity |
| Embedded fingerprint | Short HMAC fragment printed in a small code line, tied to the QR token |
| Optional "verify online" strip | Footer line stating that validity is confirmed only at the verification URL |

Implementation notes:
- Pattern parameters stored per template as JSONB (`security_config`); the per-certificate seed is
  the stored `verification_hash`, so a PDF can be re-rendered identically.
- Rendering stays in `src/lib/pdf.js` (PDFKit vector paths), split into `lib/pdf/themes/*` and
  `lib/pdf/security/*`.
- Honest limit: a determined forger can still redraw a PDF. The defense is the QR/verification
  record plus the unique per-certificate pattern; do not market the watermark as unforgeable.

## Phases

### Phase 1.1 — Hardening (next)
- Hide `/apply` and provider login from public nav; super admin creates providers and users.
- Super admin can issue certificates on a provider's behalf (CSV wizard available under `/admin`).
- Run the e2e suite in CI against a Postgres service; add `npm ci` and test jobs.
- Fix remaining items from the pre-launch checklist (secrets, `BASE_URL`, HTTPS, backups).

### Certificate content rules (decided)
- A certificate states that the trainee **successfully completed** the course (pass and completion): **no grade/score** is collected or printed.
- Certificates **do not expire**: only a completion date and an **issue date** are shown. Templates no longer have a validity period, and the verification result is only VALID or REVOKED (plus TAMPERED / NOT FOUND).
- LIV is an **accreditation body**, not a training provider. The certificate carries one short official line only: "Issued by LIV on the basis of the completion report of an accredited education partner." No long explanations on the face of the certificate; any extra wording goes in small print.
- The education partner's name is **not printed anywhere** on the certificate (decided October 5, 2026). Partner block and logos remain deferred.
- **US identity** is shown by wording, never by a flag: the header reads "Accreditation organization · Virginia, United States of America", and the small print states that LIV LLC is a private accreditation organization based in the United States and not a government agency. Do not write "US-accredited", "US-approved" or similar, which implies government recognition.

### Phase 1.3 — Certificate look (done)
Shipped: **Executive** landscape theme (US Letter, accent bars, double frame, signature, LIV seal), **framed QR badge** ("LIV VERIFIED / SCAN TO VERIFY"), **iris** multi-color guilloche (passport-style blend), and a **legal authenticity note**. All themes stay US Letter landscape.
Deferred by decision: a separate "verified" trust badge beside the QR (decided October 5, 2026 not to add it: the QR badge, seal and security strip already carry that message; revisit once an accreditation such as ISO is obtained, and never word it as "verified training"), education-partner block (name, address, approval number, left/right placement), accreditation-body logos (after ISO accreditation is obtained), and a security emblem illustration (needs professional artwork; a first in-house eagle drawing was rejected as not good enough and removed).

**Security strip (Executive, done):** a 9pt holographic-look strip on the left margin, same height as the gold frame, fading in from 0% to 100% over 70pt at both ends with the same opacity along every horizontal line. Navy/steel-blue foil with a muted gold band, banknote-style mesh, scattered curls, the LIV seal, a padlock, micro-text with the certificate number, and gold edges. Every choice is drawn from the certificate's verification hash (unique per certificate, reproducible). It is a printed visual deterrent, not a physical hologram, and uses the LIV seal only (no government or federal emblems). Toggle: "Holographic security strip" in the template form. A real foil can be applied by the printer at the same position.

### Phase 1.2 — Certificate engine (done)
- Theme registry and `security_config` per template.
- Security-pattern designer form with live preview.
- Tests: pattern is deterministic for a given hash and differs across certificates (`npm run test:unit`).
- Shipped: theme registry (`THEMES` in `src/lib/pdf.js`), `src/lib/pdf-security.js`, per-template `security_config` with live preview in the template form. Adding a theme beyond classic/modern also needs the `design` CHECK constraint widened in `src/schema.js`.

### Phase 2 — Provider gateway (designed later)
- Public application with document uploads, review workflow, conditions, renewal reminders.
- Email delivery of the certificate to the trainee; password reset and 2FA.
- Open Badges 3.0 export and LinkedIn add-to-profile with a badge.

### Phase 2a — Trainee import (done)
Shipped: CSV upload or Google Drive / Google Sheets link (server-side, Google hosts only, 5 MB cap, public "anyone with the link" files), downloadable CSV template (`/portal/issue/template.csv`, UTF-8 with BOM), `serial_no` and `national_id` columns, `full_name` or first + last name, English column headings, `;` and tab delimiters. Excel (.xlsx) upload and the Excel template are enabled for testing (`ALLOW_XLSX`, default on; set `false` for CSV only). **English only for now:** rows with letters or digits from other scripts are flagged and can be skipped; other languages are a later add-on. Holder ID numbers are stored only as a keyed HMAC hash plus the last 4 digits; never shown publicly or exported in full. Abandoned wizard files (which hold the raw rows) are purged after 6 hours.

### Phase 2b — Official email to the certificate holder (next)
- Provider: transactional email service (Postmark, Amazon SES or Resend) with the LIV sending domain verified (SPF, DKIM, DMARC). Needs a decision and credentials.
- Message: LIV-branded HTML + plain-text email: "Your certificate has been issued" with course, date, certificate ID, a **View & verify** button (verify URL with QR token), and the PDF attached or linked. Revocation notice template as well.
- Control: per-batch checkbox "Email certificates to trainees" (default off), per-provider sender name and reply-to, resend button on the certificate page.
- Reliability: `email_outbox` table (queued / sent / failed, attempts, provider message id), background worker with retry and rate limit, bounce and complaint webhooks, suppression list, audit log entries.
- Privacy and compliance: lawful basis and unsubscribe/footer text reviewed with counsel; no marketing content in transactional mail.

### Phase 3 — Knowledge hub (done)
Shipped: `articles` table, admin editor (`/admin/content`) with Markdown, draft/publish and preview, public `/knowledge` with topic/type filters and search, article pages, RSS (`/rss.xml`), `sitemap.xml`, `robots.txt`, sanitized Markdown (`src/lib/content.js`). Built inside this app, as recommended. First-run bootstrap creates the first super admin and, outside production, three starter articles.
- Content model: articles, research papers, guides; categories (Quality, Safety, Project Management);
  authors, tags, SEO metadata, sitemap, RSS.
- Admin editor (Markdown) with draft/publish; public listing and article pages in the same US brand.
- Decision needed: build inside this app (EJS + Postgres) or run a separate CMS. Default
  recommendation: build inside this app to keep one brand, one domain and one deploy.

### Phase 3b — Knowledge engines (step 1 built; rest design only)
Built (step 1): content types, named human reviewer required to publish, sources and standards on each article, freshness date, version history, "AI-assisted" disclosure, scoped service keys and the draft-only Content API (`docs/CONTENT-API.md`). Reviewer engine scaffold built (offline by default; paid model only with key and budget). Next: Producer, then Scout.
Scout (horizon scanning), Producer (drafting) and Reviewer (scientific and editorial audit) as an external service that talks to the site through a scoped Content API, with humans approving every publication. Full design, content types, build order and open decisions: `docs/KNOWLEDGE-ENGINES.md`.

### Phases 6–8 — Course catalogue, curriculum studio, candidate accounts (design only; later phases by owner decision)
LIV designs curricula and course packs with accredited partners; partners train and issue completion certificates; candidates then register with LIV for the examination (Phase 9) and receive the LIV credential. Two different certificates: completion (partner) and credential (LIV, after exam). Full model, journey, safeguards and open decisions: `docs/CREDENTIAL-MODEL.md`.

### Phase 4 — Commerce
- Digital booklets and consulting booking, checkout via Stripe through LIV LLC.
- Provider billing: accreditation fee and per-certificate issuance fee, invoices, usage metering.
- Object storage (S3/R2) for PDFs and downloadable products, with signed URLs.

### Phase 5 — Printed certificates and fulfillment (later; decided October 5, 2026)
Today certificates are **digital only** (PDF with a signed QR and the online verification page). In a later phase LIV may offer a **printing and shipping service** to education partners:
- **Physical security:** a real holographic foil strip applied by the printer in the position of the digital strip (the digital strip is then replaced by a blank foil zone in the print file), and a prominent mark (raised/embossed seal or a serialised seal sticker). The foil or sticker serial number is recorded against the certificate number so it can be checked on the verification page.
- **Print-ready output:** vector PDF at US Letter landscape with bleed and crop marks, a print file variant with the foil zone left blank, colour profile agreed with the printer, and proofing before volume runs.
- **Order flow:** partner selects certificates (one or a batch), quantity, paper/finish and shipping address; payment via Stripe through LIV LLC (Phase 4); order status, carrier tracking and a delivery record; reprints and replacements tied to the original certificate.
- **Operations:** a print vendor or in-house production (decision needed), stock and serial-number control for foil/stickers and security paper, packaging, shipping to international partners (customs, restricted-destination screening), returns and damage handling.
- **Legal and wording:** a printed certificate has the same wording rules as the digital one (no government implication; the foil is a security feature, not an endorsement); partner terms for fees and delivery times; keep the online record as the authoritative check for printed and digital copies alike.

## Legal guardrails (carry across all phases)
- Keep the non-government and non-college disclaimers on every page.
- ISO-style wording must not imply LIV is accredited by, or equivalent to, an IAF/ANAB-recognized
  certification body unless that becomes true. Describe LIV as a private accreditation organization
  of training providers.
- Complete the Virginia assumed-name filing and USPTO clearance before launch (see §13 of the
  architecture document).

## Quality records (built; readiness for recognition)
Built: controlled documents with immutable approved versions, complaints and appeals register with independent-reviewer rule and deadlines (public contact form feeds it), corrective actions with verified effectiveness, partner surveillance reviews, yearly impartiality declarations, management review / internal audit / impartiality committee records, a tamper-evident audit log (hash chain, append-only), a readiness dashboard and an assessor ZIP. See `docs/QMS-RECORDS.md` (Admin → Compliance).

## Recognition track (later)
CPD recognition (for example CPD Standards Office or IACET) and ISO/IEC 17024 accreditation of the credential scheme, to strengthen LIV's standing. The PMI-style credential model is built in the later phases (6–9). Plan, targets and readiness work: `docs/RECOGNITION-ROADMAP.md`. No recognition is claimed on the site or on certificates until granted.

## Phase 9 — LIV examinations (planned)

**Principle:** a trainee receives a certificate only after passing an examination run and supervised by **LIV**, not by the education partner. The partner delivers the training and reports completion; LIV controls assessment. Process design follows the public principles used by professional certification bodies such as CQI/IRCA (registration, candidate guidance, controlled exams, marking and moderation, fees, resits, appeals). We use the process ideas only; we do **not** copy their documents or branding, and we do not state or imply IRCA approval or equivalence unless it is granted.

### Candidate journey
1. **Eligibility** — the partner submits the completion report (today's CSV/Excel/Sheets import becomes a *completion report* that creates eligible candidates instead of issuing certificates).
2. **Registration** — candidate account, identity details, accommodations request, exam fee payment, choice of exam window or slot.
3. **Candidate guidance pack** — what the exam covers, format and duration, allowed materials, identification required, conduct rules, how it is marked, pass criteria, results timing, resit and appeal rules. Shown at registration and again before the exam starts, with a recorded acknowledgement.
4. **Exam delivery** — secure browser-based exam with identity check and proctoring (remote or at an approved venue).
5. **Marking** — automatic marking for objective items; named markers for written/scenario answers; sample double-marking and moderation; marker audit trail.
6. **Result** — pass or fail with the result letter. A pass releases the certificate automatically; no score is printed on the certificate (decision above).
7. **Fail path** — resit fee, alternative exam paper (different version from the question bank), waiting period and attempt limits, then re-registration.
8. **Appeals and complaints** — formal procedure with a deadline, reviewer independent of the original marker, outcome recorded.

### Building blocks
- **Data:** candidates, registrations, payments, exam papers and versions, question bank with metadata, exam sessions, attempts, answers, marks, markers, results, appeals, accommodation requests.
- **Roles:** candidate, proctor, marker, moderator, exam administrator (alongside super admin and partner admin).
- **Payments:** Stripe via LIV LLC (exam fee, resit fee, refunds, receipts), reconciled to registrations.
- **Proctoring:** integrate an established proctoring service rather than build one; decide remote vs in-person.
- **Exam security:** question-bank rotation, randomization, item analysis, access logs, incident log.
- **Certificate integration:** issuance gated on a pass; the verification page can show "Examination passed" with the date. The certificate statement changes from "issued on the basis of the completion report" to "issued following successful completion of the LIV examination".

### Legal and compliance (needs counsel)
Consent for identity checks and any recording or biometric processing (state laws such as Illinois BIPA), data retention, accessibility and accommodations (ADA), refund and fee terms, complaints and appeals procedure, and wording that avoids implying government or third-party endorsement.

### Decisions needed before building
Exam format and duration; pass mark and marking scheme; remote vs in-person; fee amounts and resit rules (attempt limits, waiting period); who writes and reviews the question bank; accommodations policy; data retention period; whether partners get a share of fees.
