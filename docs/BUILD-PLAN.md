# LIV — Build plan in phases (for owner review)

Status (October 9, 2026): the owner asked to proceed phase by phase. **Phase 0 code is built** (see its status below); the owner checklist for Phase 0 is open. **Track K: the governance editorial library, source verification and the content quality layer are built (K.5 to K.7); expert review (K.8) is next.** Phase 1 starts after the Phase 0 review. Each phase ends with a review before the next one starts.

This plan merges every open item from: the A–T brief (October 8; it was sent twice with identical text and is already applied, see §2), `ROADMAP.md`, `PARTNER-GATEWAY.md` (still to build), `EXAM-SYSTEM.md` (E1–E5), `CREDENTIAL-MODEL.md`, `RECOGNITION-ROADMAP.md`, `GLOBAL-STRATEGY.md`, `FUTURE-CREDENTIAL-ARCHITECTURE.md`, `HSE-GOVERNANCE-SCHEME-ROADMAP.md`, `LEGACY-NAMING.md`, the pre-launch checklist and Phase 2 backlog in `LIV-Phase1-Architecture.md` (§13, §14), and findings from a repository audit (tagged **audit**; these are proposals, not owner decisions).

## 1. How to read this plan
- **Order:** closest to the current system first, then by dependency, following the brief's priority list (T): repositioning, preservation of legacy credentials, terminology, gap analysis, HSE Governance pilot architecture, Knowledge Hub, and only then credential engines.
- **Source tags:** A–T = sections of the brief; RM = `ROADMAP.md`; PG = `PARTNER-GATEWAY.md`; EX = `EXAM-SYSTEM.md`; CM = `CREDENTIAL-MODEL.md`; RR = `RECOGNITION-ROADMAP.md`; GS = `GLOBAL-STRATEGY.md`; FA = `FUTURE-CREDENTIAL-ARCHITECTURE.md`; HSE = HSE Governance roadmap; ARC = `LIV-Phase1-Architecture.md`; LN = `LEGACY-NAMING.md`.
- **Size:** S = change inside existing modules, at most one new table; M = new screens and a migration in one area; L = a new module with several tables, roles and workflows.
- **Delivery of every phase:** work on the development branch, idempotent and additive migrations first (the live Replit deployment keeps working), unit and end-to-end tests, CI green, documents updated, short report, owner review.

### Rules that hold in every phase
1. No invented claims, accreditations, approvals, recognitions or regulatory statuses. No present ISO/IEC 17024 accreditation or conformity claim. LIV is never described as a government body, federally approved, ISO-accredited, internationally accredited or a regulatory authority.
2. Historical credential PDFs are never regenerated, altered or invalidated.
3. New credentials never carry the Education Partner's name, logo or color; the partner appears on the verification record.
4. Training Completion Credentials carry no grade and no expiry. The partner name is never on the credential face. U.S. identity is shown by wording only.
5. No automatic AI publication and no AI decision on partners, candidates or credentials. People decide and sign.
6. Membership never implies competence or certification. LIV never presents itself as issuer, examiner or decision maker for an external credential such as PMP.
7. HSE Governance title, acronym, weights, eligibility, exam rules, validity, renewal and CPD stay undefined until approved through scheme governance.
8. Secrets live only in Replit Secrets. No DNS or registrar changes by the developer. Design changes are previewed before they are applied.

## 2. Where we are
Built and tested (CI green on `ca4bd42`; 69 unit tests, 214 end-to-end checks): issuance by CSV, Excel, Google Sheets and API with HMAC records, QR and public verification; certificate engine with Executive, Classic and Modern designs and security layers; partner portal, 2FA, agreements and billing details; billing with invoices and Stripe Checkout; QMS records with a hash-chained audit log; Knowledge Hub with human publish gate, Reviewer engine scaffold and Content API; institutional repositioning (slice 1); credential classes; credential schemes, versions (status only) and partner authorized scopes (Phase 2 of the repositioning).

### Status of the A–T brief
| Section | Status | Where | Remaining work (phase) |
|---|---|---|---|
| A Credential face = LIV identity | Built, with tests | `pdf.js`, `credential-face.test.js` | Keep historical PDFs safe from loss (0.1); LinkedIn entry issuer (1.1) |
| B PDF metadata | Built, with tests | `pdf.js` | — |
| C HSE Governance, IN DEVELOPMENT | Built (page) and documented | `/credentials/hse-governance`, HSE | Scheme design work (3.7, track O) |
| D Credential classification | Built in part: 4 classes, wording, verification, `record_type` | `schemes.js`, `verify.js` | Expiry, eligibility and lifecycle (5, 7) |
| E Professional account | Designed | FA §4 | Phase 4 |
| F Application workflow | Designed | FA §5 | 5.1 |
| G Authorization to Test | Designed | FA §6 | 5.2 |
| H Examination engine | Designed | FA §7, EX | 5.3–5.4 (pilot subset), Phase 6 |
| I Certification decision | Designed | FA §8 | 5.5 |
| J Membership | Designed | FA §9 | 7.3 |
| K CPD | Designed | FA §10 | 7.2 |
| L External pathways | Designed | FA §11 | 8.1 |
| M External application support | Designed | FA §11 | 8.2 |
| N Professional transcript | Designed | FA §4 | 4.3 |
| O Certification directory | Built in part (pages, "Not yet defined") | `/credentials` | 3.1, 8.3 |
| P ISO/IEC 17024 architecture | Designed; QMS evidence exists | FA §1, §13 | 3.2–3.4, 5.8, Phase 9 |
| Q Knowledge authority | Built (topics, types, fields, human gate) | `content.js`, `/knowledge` | Engines (track K) |
| R LinkedIn distribution | Built except a per-article image | article pages | 1.7, 1.8 |
| S Saudi regulatory database | Designed | FA §15 | Track K |
| T Priorities | Followed | this plan | — |

## 3. Audit findings that shape the order
1. **Credential PDFs and partner logos are stored only on the server's disk** (`storage/`). Replit states that a published app's disk writes do not survive a redeploy ([About Deployments](https://docs.replit.com/hosting/deployments/about-deployments)). A lost PDF makes the download on the verification page answer "not available", and the only way back would be to re-render it, which rule 2 forbids. This is the first task (0.1).
2. **The repository is public and GitHub Pages is enabled** on the development branch, which is also the default branch. All internal documents (fees, strategy, exam security design, owner decisions) are publicly readable. Owner decision D-0.1.
3. **The `main` branch is an unrelated Replit Agent prototype** (TypeScript, October 4) with no common history with the working line, so it cannot be merged as a normal pull request. Owner decision D-0.2.
4. **Development defaults of the seed script** (documented in the README) must never be usable on a production server, and demo data must not appear on the public verification site. Task 0.2.
5. **Secrets that must never be lost or changed:** `CERT_HMAC_SECRET` (every credential fails verification if it changes; it also protects the 2FA secrets unless `TOTP_ENCRYPTION_KEY` is set) and `TOTP_ENCRYPTION_KEY` when used. `SESSION_SECRET` only signs sessions (changing it signs everyone out). All need an offline backup (0.6).
6. **No public privacy notice, terms of use or complaints and appeals page**, while the site processes personal data (contact and application forms, holder names and emails, ID hashes). Texts must come from counsel (1.6).
7. **"Add to LinkedIn profile" on the verification page names the Education Partner as the issuing organization.** Under decision A, LIV is the visible issuer; the record class should also appear so a completion credential is not read as a certification (1.1).
8. **Authorized scope is informational only:** a credential links to a scope when the course title matches, but a partner can still issue for any course title. A course catalog under each scope makes it real (1.3).
9. **Two CI runs failed intermittently** (the issuance confirmation, and the two-factor sign-in step). Root cause found in Phase 0: the app sent each response before writing the session, so a browser that followed a redirect at once could read the previous session (0.3).
10. **Older documents conflict with later decisions** (see §6). `ROADMAP.md` is marked accordingly.

## 4. Phases

### Phase 0 — Protect what is live
**Goal:** every issued credential and its file is kept safely, no development default works in production, and the owner can check the live system's settings on one page.

| # | Task | Source | Size |
|---|---|---|---|
| 0.1 | **Durable file storage.** Credential PDFs and partner logos are saved in PostgreSQL (table `stored_files`: key, bytes, SHA-256, size, type, time) in the same transaction as the credential row, and kept on disk as a cache. Downloads, the batch ZIP and logos read from disk when present, otherwise from the database. On start, files present on disk but missing in the database are copied byte for byte. A credential whose file is missing everywhere is reported to the administrator and **never re-rendered automatically**. Object storage can replace the database later behind the same interface (a credential PDF is about 0.3 MB). | A, T.2, ARC §13, audit 1 | M |
| 0.2 | **Production guard.** The seed script refuses to run in production without explicit passwords and never creates the demo partner there; production sign-in refuses the README's development passwords; a `purge-demo` script (dry run first) removes the demo partner and its sample credentials from a production database. | audit 4 | S |
| 0.3 | **CI stability.** Reproduce the failed CSV issuance step, make the test wait for the batch result instead of a fixed time, and record the root cause. | audit 9 | S |
| 0.4 | **Admin → System status** (read only): running commit, public base URL, production mode, storage mode and missing-file count, 2FA policy, Stripe mode (none, test, live), whether each required secret is set (never its value). | audit | S |

Owner checklist for Phase 0 (no code; I prepare step-by-step instructions):

| # | Action |
|---|---|
| 0.5 | Confirm that the Replit deployment runs this branch (the footer says "Leadership Institute of Validation" and `/credentials` exists); pull the latest commit and redeploy (the schema is applied at start). Then open Admin → System. |
| 0.6 | Replit Secrets: `NODE_ENV=production`; `SESSION_SECRET` and `CERT_HMAC_SECRET` set and copied offline to a password manager (also `TOTP_ENCRYPTION_KEY` if it is set; do not add or change it once anyone uses 2FA, since the 2FA key otherwise comes from `CERT_HMAC_SECRET`); delete `BRAND_LONG_NAME` if it still holds the earlier name; `REQUIRE_2FA=admin`. |
| 0.7 | Accounts: no account uses a development password (change it before deploying this release, or the deployed server will refuse it); remove demo data from Admin → System if it is there; check that a credential PDF downloads unchanged after a redeploy. |
| 0.8 | Backups: confirm the production database backup and restore option on Replit; keep a monthly off-platform export; test one restore. |
| 0.9 | Domain: register `livcredentials.org`, connect it in Replit, then set `PUBLIC_BASE_URL=https://livcredentials.org`. QR codes print the base URL, so issue real credentials only after the switch, and keep the Replit address working for anything issued before it. |
| 0.10 | Stripe: one payment in test mode (test key and webhook secret in Replit Secrets), then live keys. |
| 0.11 | Decisions D-0.1 to D-0.6 (§5). |
| 0.12 | If the deployment can run more than one instance at a time, keep it at one for now: the import wizard keeps its temporary upload (with raw ID numbers, deliberately outside the database and its backups) on the instance's disk for up to 6 hours, so a second instance would not find it. |

**Done when:** a PDF keeps the same SHA-256 after the storage folder is deleted (test) and after a Replit redeploy (owner check); development passwords are refused in production mode (test); CI is green three runs in a row; the checklist is ticked.
**Depends on:** nothing. **Owner inputs:** the checklist and D-0.x.

**Status (October 8, 2026): tasks 0.1–0.4 built.**
- 0.1: `src/lib/files.js`, table `stored_files` (write-once trigger), issuance, verification download, portal download and batch ZIP (one file at a time), logo upload and display; copy from disk at start and from Admin → System. Nothing is ever re-rendered. The server now applies the idempotent schema at start (`src/lib/migrate.js`, advisory lock; `MIGRATE_ON_START=false` turns it off), so a deployment that only runs `npm start` gets the new table.
- 0.2: `src/lib/dev-defaults.js` (published passwords and the demo identity), refusal at sign-in, password change, new partner users, applications and the first-run admin on a deployed server (`NODE_ENV=production` or `REPLIT_DEPLOYMENT=1`); `npm run seed` stops on a deployed server; demo removal from Admin → System (typed confirmation) or `npm run purge-demo` (dry run, then `--apply`), both through `src/lib/demo-purge.js`.
- 0.3: root cause found in the app, not in the test: express-session sends a response before it writes the session, so a browser that follows a redirect at once (or posts a form as soon as it appears) could read the previous session. Under load, 3 of 26 repeated issuance runs lost a step (two lost confirmations, one lost upload) before the fix and 0 of 40 after it. A changed session is now saved before the page or redirect is sent (`src/app.js`). The end-to-end test also waits for each navigation, prints every open page on failure, and CI keeps the server log and screenshots.
- 0.4: Admin → System (`/admin/system`): version, base URL, mode, secrets (set or not), 2FA policy, demo data, Stripe mode, public flags, file store, database.
- Tests: unit tests (`tests/unit/phase0.test.js`) and end-to-end checks for durable files, the deployed-server guard and demo removal.

### Phase 1 — Finish repositioning and make partner scope real
**Goal:** every public and partner-facing surface tells the same accurate story, and authorized scope controls what a partner can issue.

| # | Task | Source | Size |
|---|---|---|---|
| 1.1 | LinkedIn "Add to profile" names LIV as the issuing organization, uses LIV's LinkedIn page once it exists, and shows the record class in the title (D-1.1). | A, D, audit 7 | S |
| 1.2 | Terminology leftovers: README introduction, the Reviewer engine's system prompt ("accreditation body"), schema comments, `TRY-IT.md`, the pre-launch checklist naming the earlier long name. | T.3 | S |
| 1.3 | Partner course catalog under each authorized scope (admin adds courses; the issuance wizard offers catalog titles); issuance check for courses outside the catalog, warning first, blocking later (D-1.2). | O, FA §3, ARC §14.3, audit 8 | M |
| 1.4 | The partner portal shows the partner's authorized scopes and catalog. | audit | S |
| 1.5 | Public register details: authorization dates and current status per scope (D-1.3). | REPOSITIONING §4.3 | S |
| 1.6 | Policy pages rendered from approved QMS controlled documents: Privacy Notice, Terms of Use, Credential Verification Policy, Complaints and Appeals, Impartiality Statement; footer links. A page cannot be published while it holds placeholders, as with agreements. | ARC §13, GS §12, audit 6 | M |
| 1.7 | Article social image: optional image uploaded by the editor (size and ratio checked), fallback to the site card. | R | S |
| 1.8 | Structured data (JSON-LD): Organization on every page and Article on articles; credential pages only once a scheme version is published. | R, GS §7 | S |
| 1.9 | Optional: "Report a suspected fake LIV credential" from the verification page into the QMS complaints register. | GS §7 | S |

**Done when:** end-to-end checks cover the LinkedIn link, catalog check, policy pages and article image; a search of public views finds "accredit" only in the disclaimers. **Depends on:** Phase 0 (0.1 for uploaded images). **Owner inputs:** D-1.x, policy texts from counsel.

### Phase 2 — Email and the full partner gateway
**Goal:** LIV communicates officially and onboards a partner end to end without manual steps.

| # | Task | Source | Size |
|---|---|---|---|
| 2.1 | Email foundation: provider adapter, `email_outbox` (queued, sent, failed, attempts), worker with retries and rate limit, HTML and text templates, suppression list, bounce and complaint webhook, audit entries; a test driver for CI. | RM 2b | M |
| 2.2 | Self-service password reset by email (single-use hashed token, time limit, rate limit, no account enumeration). | PG, RM | S |
| 2.3 | Email to the holder when a credential is issued or revoked (per batch, off by default; resend button). | RM 2b | M |
| 2.4 | Partner application v2: public form with document uploads, review workflow (submitted, under review, information requested, approved with conditions, declined), conditions tracking, decision note, reviewer impartiality check. | PG, ARC §14.4 | L |
| 2.5 | Onboarding checklist: agreement, billing details, 2FA, first template, approved scope, test issuance. | PG | S |
| 2.6 | Reminders: authorization end dates and overdue invoices. | PG, BILLING | S |
| 2.7 | Sanctions screening record at onboarding (list checked, date, result, reviewer). | PG, GS | S |
| 2.8 | Optional: webhooks to partner systems on issuance and revocation. | ARC §14.8 | M |

**Done when:** CI covers reset, application and issuance email with the test driver; a real message from the live domain passes SPF, DKIM and DMARC. **Depends on:** Phase 1 (policy texts referenced in emails). **Owner inputs:** D-2.x, sending domain records added by the owner, counsel text for email footers.

### Phase 3 — Scheme governance and internal clean-up
**Goal:** everything a credential scheme needs before any assessment exists is held as approved records, and the legacy internal names are retired while data is still small.

| # | Task | Source | Size |
|---|---|---|---|
| 3.1 | Scheme versions with all directory fields (designation, class, audience, competency framework, scheme-specific eligibility rules, assessment and exam format, application process, fees reference, retake policy, validity, CPD and recertification, policies), each tied to an approved QMS document, with named approver and date. Public pages show approved fields only, "Not yet defined" otherwise. No values are entered by the developer. | O, FA §3 | L |
| 3.2 | Scheme committee: members, terms of reference, conflict-of-interest register and decisions (reusing QMS declarations and meetings). | P, HSE | M |
| 3.3 | Personnel competence records for reviewers, examiners, decision makers and item writers (qualifications, authorizations, review dates). | P | M |
| 3.4 | Records retention schedule per record type, with a report; deletion only with approval. | P, RR | M |
| 3.5 | Legacy internal renames with migrations and tests (`authorization_status`, fee category key, contact topic value, `issuanceNote`, `colors: 'liv'`). | LN | M |
| 3.6 | Curriculum pack records: version, scheme link, licensed partners (content comes from the committee). | CM | M |
| 3.7 | HSE Governance: charter and committee records entered; the page stays IN DEVELOPMENT until a version is approved. | C, HSE | S |

**Done when:** a scheme version can be drafted, reviewed and approved with QMS references, and only approved fields appear publicly; the renames ship with no change in behavior. **Depends on:** Phase 1. **Owner inputs:** D-3.x.

### Phase 4 — Professional account, transcript and badges
**Goal:** each person has one permanent LIV identity that gathers their LIV records under their control.

| # | Task | Source | Size |
|---|---|---|---|
| 4.1 | `persons` with a permanent LIV Professional ID, candidate role, sign-up with email verification, optional 2FA, profile. | E | L |
| 4.2 | Claim existing credentials by a verified match (email plus the credential's QR token or ID check); never merge on name alone. | E, N | M |
| 4.3 | Professional transcript with per-item visibility, private by default, and a share link; each record still verifies at `/verify`. | N | M |
| 4.4 | Open Badges 3.0 export for credentials, signed by LIV; can be brought forward without accounts (D-4.1). | RM, GS | M |
| 4.5 | Privacy self-service: data export and deletion request, with retention exceptions. | audit | M |

**Done when:** a holder creates an account, claims a credential, publishes a transcript entry, and exports a badge that passes an Open Badges 3.0 validator. **Depends on:** Phase 2 (email). **Owner inputs:** D-4.x, privacy notice covering accounts.

### Phase 5 — Assessed Professional Qualification pilot
**Goal:** issue the first Assessed Professional Qualification through a recorded pathway with a small cohort, using supervised sittings (EX option A) and examiner-entered results, before the full exam engine exists.

| # | Task | Source | Size |
|---|---|---|---|
| 5.1 | Applications with the brief's statuses, evidence items with verification, status history, scheme-specific eligibility, random audit sampling. | F | L |
| 5.2 | Authorization to Test, created only from "Approved for Examination"; validity window, attempts, accommodations; it never creates a credential. | G | M |
| 5.3 | Sittings: monthly exam day, booking, consent, candidate guidance acknowledgment, supervisor checklist, incident log, evidence. | EX E2 | M |
| 5.4 | Assessment results entered by an authorized examiner, with moderation. | H | M |
| 5.5 | Decision record (status, date, authority, basis, conflict-of-interest check, credential issued); only a positive decision issues. | I | M |
| 5.6 | `assessed_qualification` issuance enabled only with an approved scheme version; credential design previewed and approved first. | D | M |
| 5.7 | Exam fees and refunds by approval. | EX, FEES | S |
| 5.8 | Result appeals linked to attempts and decisions (QMS cases). | P | S |

**Done when:** a test candidate goes from application to an issued Assessed Professional Qualification with every step recorded and present in the assessor pack. **Depends on:** Phases 3 and 4. **Owner inputs:** D-5.x.

### Phase 6 — Examination engine
**Goal:** version-controlled, auditable examinations delivered in the browser, with the item bank isolated from public content.

Tasks: exam catalog, blueprints and competency domains; item bank and item versions in isolated tables and roles; frozen exam forms and languages; in-browser delivery (timer, autosave, randomized order); scoring, item statistics and retakes; identity checks, accommodations and security incidents; later, a remote proctoring vendor (EX E4) and test centers (E5). Source: H, EX E1, E3–E5. Size L.

**Done when:** forms cannot change once used; tests prove public routes and the Content API cannot read item tables; a pilot form is delivered to test candidates. **Depends on:** Phase 5. **Owner inputs:** item writers and reviewers under confidentiality agreements, psychometric adviser, cut-score study, vendor when volume requires.

### Phase 7 — Professional Certification lifecycle, CPD and membership
| # | Task | Source | Size |
|---|---|---|---|
| 7.1 | `professional_certification` class: certification cycle and expiry, suspension, withdrawal, renewal. | D, K | M |
| 7.2 | CPD activities with evidence and review; cycle rules per scheme. | K | M |
| 7.3 | Membership in separate records and pages, never shown as competence; benefits; pricing only once approved. | J, E | M |

**Depends on:** Phases 5–6. **Owner inputs:** D-7.x.

### Phase 8 — External credential pathways and the full directory
| # | Task | Source | Size |
|---|---|---|---|
| 8.1 | External credential registry (credential, owner and issuer, official link, the LIV role actually allowed). | L | S |
| 8.2 | Pathway cases: guidance, education, application support, registration support, status tracking; links to the official system only; no simulated booking. | M | M |
| 8.3 | Directory completion: every field from O, and authorized partners per scheme. | O | S |

**Depends on:** Phases 3–4. **Owner inputs:** D-8.x, counsel on trademark use.

### Phase 9 — Printing, attestation and recognition
Print-ready output and order flow (RM Phase 5); notarization and apostille service (GS §12.2); software support for the recognition track (ISO 9001 or ISO 21001 for LIV's management system, CPD recognition, IACET, certificate-program accreditation under ASTM E2659 (to be confirmed), and ISO/IEC 17024 after an operating record; note the third edition, ISO/IEC 17024:2026, published March 31, 2026 per ISO Open Data: any gap analysis must use it) (RR). Site wording changes only after a grant, in the words the granting body allows. Size M, with long non-software lead times.

### Track K — Knowledge engines and Saudi regulatory database (parallel)
Can start any time after Phase 1, as soon as the model key, monthly budget and named reviewers exist. It does not block, and is not blocked by, the credential phases.

| # | Task | Source | Size |
|---|---|---|---|
| K.0 | Move the engines' monthly spend ledger (`engines/data/usage.jsonl`) into the database before paid calls run on a host that wipes the disk at redeploy; otherwise the month's spend would reset. | audit | S |
| K.1 | Producer engine (drafts only, through the Content API). | Q, `KNOWLEDGE-ENGINES.md` | M |
| K.2 | Scout engine (horizon scanning). | `KNOWLEDGE-ENGINES.md` | M |
| K.3 | Saudi regulatory requirements database with the fields from S, admin-only until verified; "mandatory" only with an official source, a verified date and a reviewer. | S | M |
| K.4 | Links from requirements to LIV schemes and partner programs. | S | S |
| K.5 | **Governance editorial library** (`content/library`, `docs/GOVERNANCE-LIBRARY.md`): 23 items (handbook, guides, framework, templates, glossary, GCC regulatory map, 9 research digests), loaded as drafts with an automated report each. **Built.** | owner request (Oct 9) | M |
| K.6 | **Source verification through official routes**: ISO Open Data for standards (`npm run check:standards`), Crossref, DataCite and OpenAlex for DOIs and licenses, official hosts with completed TLS chains (`npm run check:sources`); trusted-source register by tier; legal claims need an official source. **Built.** | owner request | S |
| K.7 | **Content quality layer**: document control block (audience, scope, edition, dates) on every library item; plain-language and drafting check in the Reviewer (informed by ISO 24495-1:2023 and the ISO/IEC Directives verbs, advisory only); expert review pack per item (Excel, English and Arabic: every statement with its source, sources, quality checklist, reviewer declaration) in the editor and as a ZIP for the library (`npm run review-packs`). **Built.** | owner request | S |
| K.8 | Expert review of the 23 library items using the packs: governance specialist for the foundations and tools; licensed lawyer(s) for the GCC map (Saudi Arabia and the UAE first); HSE specialist for the HSE guide and digests. Each item is published only under the reviewer's name. | owner | — |
| K.9 | Reader pilot of the small business handbook with 3 to 5 owners of shops or small firms (find, understand, use), and edits from their answers. | owner, ISO 24495-1 | S |
| K.10 | Model-based claim check (Reviewer `claims:model`) against source excerpts, with a different model from the one that drafted the text. Needs a model key and a monthly budget (`docs/KNOWLEDGE-ENGINES.md`). | Q | S |
| K.11 | Close the "Points still being verified" in the GCC map from official texts (Saudi 2018 family charter guide, UAE MR 44/2022 and PDPL executive regulations, Kuwait Companies Law amendments after 2017, Oman listed-company code under the FSA). | owner | S |
| K.12 | Review cycle: re-run `check:standards` and `check:sources` and re-review each item at its next review date (6 months for the GCC map and regulatory items, 12 months for the rest). | GOVERNANCE-LIBRARY | S |
| K.13 | Uniform reference style for sources, following ISO 690:2021 elements (creator, title, edition or date, publisher, identifier or link, access date). | owner | S |

### Track M — GCC and MENA market features (parallel, by owner choice)
| # | Task | Source | Size |
|---|---|---|---|
| M.1 | Arabic right-to-left versions of the key public pages. | GS §12.1 | M |
| M.2 | Signed digital verification letter (it is not an apostille). | GS §12.2 | S |
| M.3 | Local acceptance guides as reviewed Knowledge Hub content. | GS §12 | — |
| M.4 | Arabic editions of the governance library after M.1, translated and reviewed by a qualified Arabic legal and governance reviewer (not machine-published); legal texts quoted from the official Arabic. | owner | M |

### Track O — Owner and specialists (non-software, long lead times)
- **Counsel:** privacy notice and terms (U.S., Saudi PDPL, UAE PDPL, GDPR where relevant), partner agreement, email footers, exam consent and data handling, trademark use of external credentials, review of disclaimers.
- **Registrations:** Virginia assumed-name filing for "Leadership Institute of Validation" and "LIV" (the earlier checklist names the earlier long name), USPTO clearance for the new name, the domain.
- **Finance:** Stripe verification, tax adviser, bank, legal address.
- **HSE Governance:** charter, committee of 3–5 experts, psychometric adviser, Job Task Analysis countries.
- **Exams:** supervisors, item writers and reviewers who do not train candidates.
- **Recognition:** ISO 9001 consultant, CPD body enquiries.
- **Research:** the Saudi regulatory project, official sources only. **Distribution:** LIV LinkedIn company page.
- **Content reviewers (K.8):** a governance specialist, licensed lawyer(s) in Saudi Arabia and the UAE (then the other GCC states), an HSE specialist; written terms, conflict of interest declarations, and the right to be named on published items. Decide the fee and turnaround.
- **Content claims:** the library never states or implies that LIV, its guides or its credentials are accredited, approved or endorsed. Wording: "prepared with reference to the standards and sources cited, reviewed by [name, specialty]".

### Dependencies at a glance
```
Phase 0 → Phase 1 ─┬→ Phase 2 → Phase 4 ─┬→ Phase 5 → Phase 6 → Phase 7
                   └→ Phase 3 ───────────┤
                                         └→ Phase 8 (needs Phases 3 and 4)
Phase 9: printing on demand at any time; recognition after an operating record (Phase 5 onward).
Track K and Track M: any time after Phase 1. Track O: starts now.
```

## 5. Decisions needed from the owner (with recommendations)
| # | Decision | Recommendation |
|---|---|---|
| D-0.1 | Repository visibility and GitHub Pages | Private repository and Pages off; share code as a ZIP or through a connector. Check that Replit's GitHub connection keeps access. |
| D-0.2 | The `main` branch | Keep the prototype as a branch named `archive/replit-prototype`, then point `main` at the working line (done only on written approval). Alternative: leave it; the default branch already is the working line. |
| D-0.3 | Where credential files are kept | PostgreSQL now (task 0.1); object storage later through the same interface. |
| D-0.4 | When real credentials start | Only after `livcredentials.org` is live and `PUBLIC_BASE_URL` is set. |
| D-0.5 | Two-factor policy | `admin` now; `all` before the first paying partner. |
| D-0.6 | `PUBLIC_FEES` and `PUBLIC_APPLY` | Fee page on once Stripe is live; public application off until task 2.4. |
| D-1.1 | LinkedIn entry title | "[Course] (Training Completion)", issuing organization LIV. |
| D-1.2 | Issuing outside the catalog | Warn first; block once every active partner has a catalog. |
| D-1.3 | Register details | Show authorization dates and current status; status history on request. |
| D-2.1 | Email provider | Postmark, Amazon SES or Resend; sending domain on `livcredentials.org`. |
| D-2.2 | Partner application | Criteria, required documents and named reviewers. |
| D-2.3 | Sanctions screening | Manual check against official lists, recorded, until volume justifies a paid service. |
| D-3.1 | HSE Governance scheme | Committee members, psychometric adviser budget, Job Task Analysis countries; first class: Assessed Professional Qualification. |
| D-3.2 | Internal renames | Approve task 3.5. |
| D-4.1 | Badges and IDs | LIV Professional ID format; badges with accounts, or earlier by email if a partner needs them sooner. |
| D-5.x | Pilot | Exam policy, supervisors, assessment method, fees, retake rules. |
| D-7.x | Certification and membership | Cycle, CPD units, ethics requirement, membership tiers and prices. |
| D-8.x | External credentials | Which credentials, and the role LIV actually plays for each, confirmed in writing. |
| D-K | Engines | Model key, monthly budget, named reviewers, approved source list. |
| D-M | Arabic | Timing of Arabic pages; an Arabic line on credentials (open since October 5). |

## 6. Conflicts in older documents and how this plan resolves them
| # | Older text | Resolution |
|---|---|---|
| C1 | `ROADMAP.md` Phase 9: "a trainee receives a certificate only after passing an examination run and supervised by LIV" | Superseded by the classification model (D): Training Completion Credentials continue on partner completion reports; examinations lead to Assessed Professional Qualifications or Professional Certifications. |
| C2 | "Certificates do not expire" | Applies to Training Completion Credentials; certification classes follow their scheme's approved validity. |
| C3 | "LIV is an accreditation body" and "accredited education partner" in older documents | Superseded by `REPOSITIONING.md` (authorization and credentialing terms). |
| C4 | Delivery order of October 5 (engines, commerce, gateway, badges, exams, catalogue, recognition, printing) | Commerce and the gateway slice are built; this plan follows the October 8 priorities (T); engines run as track K once the key and budget exist; badges come with Phase 4 or earlier (D-4.1). |
| C5 | Pre-launch checklist: assumed-name filing for the earlier long name | File for "Leadership Institute of Validation" and "LIV"; counsel to confirm. |

## 7. Review gate
Phase 0 code is done; its owner checklist (0.5–0.12) and decisions D-0.x are open. Next on approval: **Phase 1**, with the decisions D-1.1 to D-1.3.
