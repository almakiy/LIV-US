# LIV — Future credential architecture (design, not built)

Status (October 8, 2026): design only. Nothing in this document is built except where marked **Exists**. It answers Master Brief sections D–S and keeps the platform on a path toward a genuine ISO/IEC 17024 conformity assessment later. LIV does not claim ISO/IEC 17024 accreditation or conformity today.

## 1. Principles
1. **Separation of functions** (17024 pathway): education, Education Partner commercial activity, candidate eligibility, assessment, examination, certification decision, credential issuance, membership, CPD, complaints and appeals are separate records with separate owners and permissions. A record in one area never silently creates a record in another.
2. **An assessment result is not a certification decision.** Passing an exam produces a result; a person with decision authority records the decision; only a positive decision issues a credential.
3. **Membership is never competence.** No membership record appears on a credential or a verification page as evidence of competence.
4. **External credentials stay external.** LIV records its real role (education, candidate support, administrative help) and never presents itself as the owner, examiner or decision maker for another body's credential.
5. **Nothing is invented.** Credential titles, weights, eligibility, exam rules, validity and fees exist only once approved through scheme governance; pages show "not yet defined" otherwise.

## 2. Credential classification (D)
**Exists (partly):** `src/lib/schemes.js` `RECORD_TYPES` with four classes; `renderCertificate` refuses classes that are not `available`; the verification page states the record type; tests in `tests/unit/credential-face.test.js`.

| Class | Issuer | Wording on credential | Assessment shown | Expiry | Eligibility | Lifecycle |
|---|---|---|---|---|---|---|
| Training Completion Credential (`training_completion`) | LIV, on an Authorized Education Partner's completion report | "Certificate of Training Completion ... has successfully completed the training course" | None | None (owner rule) | Enrolment with the partner | Issued, corrected, revoked |
| Assessed Professional Qualification (`assessed_qualification`) | LIV | "Professional Qualification ... has met the assessment requirements of the LIV [Scheme]" | Assessment name and date | Scheme-defined (may be none) | Scheme-defined | Issued, revoked; optional review |
| Professional Certification (`professional_certification`) | LIV, after a certification decision | "Professional Certification ... has met the certification requirements of the LIV [Scheme]" | Exam and decision | Yes (cycle) | Education, experience, prerequisites | Issued, suspended, expired, renewed, withdrawn |
| External Credential Pathway (`external_pathway`) | The external owner (e.g. PMI) | Never rendered as a LIV credential | Not LIV's | Owner's rules | Owner's rules | Tracked as support status only |

Domain changes needed: `certificates.record_type` (default `training_completion`, backfill existing rows), `certificates.scheme_id`, `certificates.scheme_version`, `certificates.expires_on` (null for completion), `certificates.decision_id`; verification and PDF wording read from the class, not from templates.

## 3. Schemes and partner scope (O)
Tables: `credential_schemes` (slug, title, designation, class, status draft|in_development|published|retired, owner committee), `scheme_versions` (version, effective_from, competency framework JSON, eligibility rules JSON, assessment spec, validity, renewal, CPD rule, fees reference, policies, approved_by, approved_at), `partner_scopes` (partner, scheme or course, status, from, to, decision reference). Public directory pages render only published versions; every missing value shows "not yet defined".
Reuse: QMS controlled documents (`qms_documents` and versions) already give versioning, approval and obsolescence; scheme versions should reference an approved QMS document. Partner register pages (`/partners/{slug}`) and the verification record gain the authorized scope from `partner_scopes`.

## 4. Individual professional account (E, N)
Tables: `persons` (permanent LIV Professional ID `LIVP-XXXXXXXX`, name, email, country, public profile flags), `person_identities` (verified ID documents, hashed), link `certificates.person_id`. Transcript page `/p/{professional-id}` shows only what the person makes public: active and historical LIV credentials, assessed qualifications, CPD summary, badges, renewal status, externally verified credentials.
Reuse: users/auth (bcrypt, TOTP, forced password change), account security pages, ID hashing with last-4 (`issuance.js`), verification page layout. A new `candidate` role is needed; today users are `super_admin` and `platform_admin` only.

## 5. Certification application workflow (F)
`applications` (person, scheme version, status: draft, submitted, under_review, evidence_required, audit_review, eligible, not_eligible, approved_for_exam, withdrawn), `application_evidence` (type: education, experience, responsibilities, prerequisite credential, training, reference, employer confirmation, upload; file, verified_by, verified_at), `application_events` (status history with actor and reason). Eligibility rules are evaluated from the scheme version, then confirmed by a reviewer. Random audit sampling sets `audit_review`.
Reuse: multer uploads with size and type limits, QMS case pattern (status machine with events and audit), agreements acceptance pattern for candidate declarations, audit log hash chain.

## 6. Authorization to Test (G)
`test_authorizations` (application, exam, valid_from, valid_to, attempts_allowed, accommodations, status). Created only from `approved_for_exam`; it never creates a credential. Flow: Application → Eligibility review → Authorization to Test → Examination → Results → Certification requirements review → Certification decision → Credential issuance.

## 7. Examination engine (H)
See also `EXAM-SYSTEM.md` for operations. Entities: `exams` (catalog), `exam_blueprints` (domains, weights, item counts per version), `competency_domains`, `items` and `item_versions` (stem, options, key, rationale, references, status, author, reviewer), `exam_forms` (assembled from item versions, language, version, frozen), `sittings` (scheduling, supervisor, mode: remote, test center), `attempts` (authorization, form, start, end, responses encrypted, score, result), `identity_checks`, `accommodations`, `security_incidents`, `result_appeals`.
Isolation: the item bank lives in its own tables with its own role (`item_writer`, `item_reviewer`, `exam_admin`), never queried by public routes or the Content API, never sent to AI tools that retain data, export only to authorized assessors. Forms are immutable once used; every change is a new version and is audit-logged.
Reuse: audit log hash chain, service-key scoping pattern, QMS incidents (cases) for security incidents and appeals, billing products for exam fees (already in the catalog as later-phase items), the Reviewer engine's citation and claim checks for item references.

## 8. Certification decision (I)
`certification_decisions`: decision_status (pending, granted, refused, deferred), decision_date, decision_authority (user and role), decision_basis (results, eligibility, evidence, references), conflict_of_interest_check (declaration reference and result), credential_issued (certificate id). The decision maker must not have trained or assessed the candidate; the check reads QMS impartiality declarations.
Reuse: `qms_declarations` (impartiality), QMS meetings for decision panels, audit log, issuance pipeline for the final credential.

## 9. Membership (J)
`memberships` (person, tier, status, period, payment). Benefits (exam and renewal discounts, research, briefings, webinars, CPD, community, career resources) attach to membership, never to credentials. No pricing until approved.
Reuse: billing catalog, invoices and Stripe Checkout; discounts with mandatory reasons.

## 10. CPD (K)
`cpd_activities` (person, type: course, conference, webinar, reading, teaching, publishing, volunteering, practice, partner activity; hours/units, evidence, status, reviewer), per-scheme cycle rules (cycle length, units, ethics requirement, reassessment) stored in the scheme version. LIV-specific terminology only.
Reuse: uploads, review status pattern, partner portal for partner-provided activities.

## 11. External credential pathways (L, M)
`external_credentials` (code e.g. PMP, title, owner e.g. Project Management Institute (PMI), official URL, LIV role allowed: education | candidate_support | administrative), `external_pathway_cases` (person, credential, partner, stage: guidance, education, application support, registration support, status tracking, notes). Every page and record shows: Credential, Credential Owner / Issuer, Education Provider, LIV Role. No simulated official booking or result; links go to the owner's own system, which stays authoritative. Partner content must not reuse an external body's proprietary material without permission.

## 12. Certification directory pages (O)
Fields: official title, designation, class, audience, competency framework, eligibility, education and experience requirements, assessment methods, exam format, application process, fees, retake policy, validity, CPD/recertification, authorized partners, scheme version, policies, application call to action. Rendered from the published scheme version; any empty field shows "Not yet defined".
**Exists:** `/credentials` and `/credentials/{slug}` (static data in `schemes.js`); to be backed by `credential_schemes` later.

## 13. ISO/IEC 17024 evidence (P)
| Evidence area | Exists today | To add |
|---|---|---|
| Impartiality | QMS declarations; impartiality review in QMS starter documents; no consulting rule | Committee records, decision COI check |
| Personnel competence | — | Staff competence records (examiners, decision makers) |
| Scheme governance | QMS controlled documents, versions, approvals | Scheme versions linked to documents |
| Application review | — | Applications, evidence, events |
| Assessment and examination | — | Item bank, forms, attempts, incidents |
| Certification decisions | — | Decisions table |
| Records | Hash-chained audit log; assessor ZIP export | Retention schedule per record type |
| Confidentiality and security | TOTP, roles, ID hashing, HMAC records | Item bank isolation, encrypted responses |
| Complaints and appeals | QMS cases (complaint, appeal) with workflow | Exam result appeals linked to attempts |
| Recertification | — | CPD and renewal cycle |

## 14. Knowledge authority platform (Q, R)
**Exists:** articles with kind, category, author, reviewer, reviewed_at, next_review_at, version, sources, standards, tags, AI-assisted flag, human publish gate, automated Reviewer engine, RSS, sitemap, canonical and Open Graph tags (site level).
Gaps: topics beyond Quality / Safety / Project Management (Governance, HSE Governance, Environment, QHSE, Project and PMO Governance, Project Information Governance, Professional Credentialing, Assessment and Competence, Standards, Compliance, Saudi / GCC Workforce Development); content types Framework, Checklist, Template, Career Guide, Industry Analysis, Professional Briefing (rename of `briefing`); `jurisdiction` field; per-article Open Graph image; "Share on LinkedIn" and "Copy link" on article pages; author pages. The publish gate stays human.

## 15. Saudi regulatory opportunity database (S)
Separate table set, admin-only until verified: `regulatory_requirements` (title, training or credential, authority, sector, occupation, activity type, legal basis, regulation or decision, mandatory | conditional | recommended, validity / renewal, official source URL, evidence excerpt, effective date, last verified date, verified_by, has_liv_scheme, partner_offers). A requirement cannot be published as mandatory without an official source and a verified date. Reuse: Content API patterns, Scout engine (planned) for change detection, Reviewer source checks.

## 16. Reuse map
| Future capability | Reusable today |
|---|---|
| Credential classes and wording | `schemes.js` RECORD_TYPES, `pdf.js` kind-driven headings, verification page |
| Scheme governance | QMS documents/versions/approvals, audit log |
| Partner scope | `platforms`, partner register pages, QMS partner reviews |
| Professional account | auth, TOTP, account security, ID hashing, verification layout |
| Applications and evidence | multer uploads, QMS case workflow pattern, agreements acceptance |
| Exam fees, membership, renewals | billing catalog, invoices, discounts, Stripe Checkout and webhook |
| Exam security incidents, appeals | QMS cases and corrective actions |
| Decisions and impartiality | QMS declarations and meetings, audit log |
| Issuance | `issuance.js` (HMAC record, QR, PDF), revocation, public verification API |
| Knowledge authority | articles, Reviewer engine, Content API, RSS, sitemap |
| Regulatory database | Content API scopes, engine budget and kill switch, Reviewer source checks |
