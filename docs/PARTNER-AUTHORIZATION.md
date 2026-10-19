# Authorized Training Providers: criteria, application states and activation

Terminology (owner decision, October 18, 2026): partners are **LIV Authorized Training Providers (ATP)**; always written with LIV's name so no link to other bodies' programs is implied.

Status (October 18, 2026): Batch A of the partner-gateway plan, approved by the owner. This document only; no code has changed. It turns the reviewed recommendations into rules that later batches (B to I) implement and test. Values marked **[P-n]** are pending owner decisions (§12). No names, fees or thresholds are invented here.

Functional references (used for structure only; their designs are not copied, and their accreditations or approvals are not attributed to LIV):
- OSHAcademy: partner network experience.
- IACET: readiness check and evidence.
- NEBOSH and IOSH: trainers and course content.
- ANAB: scopes and statuses.

## 1. Guardrails
- **LIV issues every credential.** A partner delivers training and reports completions; it never issues, signs or changes a credential.
- **Activation is earned, not bought.** Payment, a conditional acceptance or an open appeal never grants issuance rights by itself.
- **The past stays intact.** Historical credential PDFs are never regenerated, altered or invalidated. A later change in a partner's status does not by itself invalidate a credential that was issued correctly.
- **No status claims.** No accreditation, approval or recognition claim is made for LIV or its partners. Public claims wording stays under owner review (D-C).
- **HSE Governance stays IN DEVELOPMENT.** No partner scope may be granted for it until its scheme is approved.

## 2. Definitions
| Term | Meaning |
|---|---|
| Application | A partner's request for authorization, kept as numbered, locked versions with their evidence |
| Acceptance | LIV's decision that the application meets the criteria, possibly with conditions. It does not allow issuance |
| Activation | A separate step after acceptance: LIV confirms the activation checklist (§6) is complete and turns the authorized scope on |
| Authorization (scope) | What the partner may deliver for LIV credentials. One scope = entity + course and version + delivery mode + language + site where needed + approved trainers + validity dates + restrictions (§7) |
| Partner status | The partner account's overall state (today `pending`, `active` or `suspended`). Issuance needs an active partner **and** an active scope |
| Nonconformity | A criterion not met. Major blocks acceptance or activation; minor allows it with a dated corrective action |

## 3. Authorization criteria
Each criterion has a code, a version, the evidence accepted, a minimum, the class of nonconformity if it is not met, and a decision owner. A scoring average never offsets a failed criterion. The matrix is versioned (`PA-CRIT v0.1`, draft); an application is assessed against the version in force when it was submitted, unless the transition policy says otherwise **[P-9]**.

| Code | Criterion | Evidence accepted | Minimum | If not met | Decided by |
|---|---|---|---|---|---|
| C1 | Legal entity and accountability | Registration document, legal and trading name, country of operation, local training license where the country requires one, authorized representative | Valid documents; entity, representative and activity match | Major | Decision-maker |
| C2 | Training management | Named academic lead, quality roles, experience relevant to the scope | A named, accountable lead able to manage training **[P-5: experience threshold]** | Major | Decision-maker on assessor's report |
| C3 | **Trainer eligibility (required for activation)** | CV, qualifications, subject experience, training-delivery competence, identity; verification of the evidence; a delivery sample where the scope requires it | Every trainer named for a scope meets the scope's trainer requirements **[P-5: thresholds per scope]** | Major. No scope is activated without at least one eligible trainer on record | Decision-maker on assessor's report |
| C4 | Course content | Course outline and version, learning outcomes, materials, rights to use the materials | Each outcome maps to content and to how it is evidenced | Major if outcomes are missing; minor for gaps in mapping | Decision-maker |
| C5 | Delivery | Site, platform or blended mode; languages; learner support; accessibility of delivery | Demonstrated ability for the requested mode and language | Major | Decision-maker |
| C6 | Completion and learning assessment | Attendance and participation records, completion rules, learning assessment where the credential class requires it | Records match what the credential states | Major | Decision-maker |
| C7 | Learner protection | Enrollment terms, fees and refunds, complaints procedure, arrangements if the partner stops trading | A usable route, published to learners before enrollment | Major | Decision-maker |
| C8 | Records and data | Record model, access rights, retention, data sharing with LIV, incident handling | A batch can be traced back to training evidence | Major | Decision-maker |
| C9 | Integrity and marketing | Declarations of interest, marketing samples, use of intermediaries and subcontractors | Commitment to LIV's mark rules and to staying inside the scope | Minor, or major for any misleading claim | Decision-maker |

Trainer eligibility (C3) is an activation condition even before any trainer-management screens exist (Batch I or later). Until then, eligible trainers are recorded per scope as a controlled record: an evidence document plus the assessor's finding, linked to the application. A scope without that record is not activated.

## 4. Application states
```
draft → submitted → completeness_check → [info_requested ↺] → technical_review
      → [corrective_action ↺] → awaiting_decision → accepted_pending_activation | declined
      (withdrawn and closed are reachable from any open state)
```
| State | Who moves it | Exit rule |
|---|---|---|
| draft | Applicant | Submit locks version 1 and its evidence |
| submitted | System | Moves to completeness_check |
| completeness_check | LIV staff | Identity, legal standing and sanctions screening recorded; documents complete, or info_requested |
| info_requested | Applicant | New version submitted. Earlier versions and the reviewer's notes are kept unchanged |
| technical_review | Assessor | Criterion-by-criterion findings recorded against the criteria version |
| corrective_action | Applicant, then assessor | Each nonconformity closed with evidence and a dated verification |
| awaiting_decision | Decision-maker (not the assessor) | Decision with reasons |
| accepted_pending_activation | LIV staff | Activation checklist complete (§6). Blocking conditions met |
| declined, withdrawn, closed | — | Final. A new application starts a new record |

Every transition writes an event (who, when, from, to, reason) to the application history and the audit log. Transitions are checked on the server, not only hidden in the interface.

### 4.1 Staged application (owner request, October 19, 2026; built as F2)

A long form discourages applicants, so the application is split into short stages. Each stage saves on its own, any stage can be left and resumed later, and only submission checks that required items are complete.

| Stage | Content | Time |
|---|---|---|
| 1. Create the account (public) | Organization name, country, contact full name, work email, phone, password. Creates a pending provider account with no powers and signs the user in. | about 1 minute |
| 2. Organization | Legal and trading name, registration number, website, authorized representative (name, position, email; prefilled from stage 1) | about 5 minutes |
| 3. Training | Academic lead, field and subjects, delivery modes, platform or site, trainers, completion rules | about 10 minutes |
| 4. Policies and declarations | Learner protection, records, declared interests | about 5 minutes |
| 5. Documents | Per-criterion documents; C1 and C3 are required | about 5 minutes |
| 6. Review, pay and submit | Completeness list, the application fee, submission | about 2 minutes |

Rules:
- The account and the dashboard come first; the application is started from the dashboard, so a person can look around before committing.
- Progress is shown as stages done; optional fields are collapsed under "Add more details"; every field has a short hint and an example.
- Payment is the last step, after the applicant has seen the whole form. The fee for the application is invoiced when the applicant chooses to submit, paid by card or bank transfer. LIV review (the move past the completeness check) starts when the fee is received; the fee pays for the work and never affects the decision, and payment never activates a provider.
- An unsubmitted draft is kept; after a period of inactivity (proposed 180 days, with reminders at 30 and 90 days) it is closed after notice. The period depends on retention (P-14).
- Account email is not verified until the email foundation (task 2.1) exists; that task is recommended before `PUBLIC_APPLY` is switched on.
- No stage changes what is required: the 17 fields, the English-only rule and the evidence rules are the same.

**Built (October 19):** the six stages in the portal (stage 1 is the `/apply` sign-up with a phone number, English-only names), stage-by-stage saving with progress, optional fields folded away, sign-up details prefilled, "Submit and pay" at the end, the application fee invoiced from the price catalog at the Bronze (Starter) price (`ACC_APPLICATION`), review past the completeness check blocked until that invoice is paid, and the daily sweep that closes unsubmitted drafts after 180 days. Reminders at 30 and 90 days wait for the email foundation (task 2.1).

**Lessons from a peer's onboarding** (the CPD Certification Service's reply to an enquiry, shared by the owner on October 19):
1. An automatic acknowledgement within about an hour, addressed to the person, that says what happens next. Needs the email foundation (2.1), which moves up in priority.
2. A short first contact, then a "tell us more" step while the team reviews. This matches the staged form: detail is asked after the account exists, never before.
3. A named team that follows up. LIV needs a partner-relations contact for enquiries and applicants. Suggested as a fourth position with no assess, decide or activate permission, so that the people who review do not also sell.
4. The benefits are listed in plain words in the first message. LIV's list, using only what exists: register listing, partner portal and API, verifiable credentials, level badge, logo licence, support. Statistics are used only when LIV has real figures; none are claimed before.
5. Published service targets. Proposed for LIV: acknowledgement automatic; first human contact within 2 working days; completeness check within 5 working days of the fee; decision within 30 days of a complete file.
6. Guidance packages that coach a provider through its own approval are not copied: coaching an applicant is a conflict of interest for an authorizing body (`FEES.md` §1). Public templates and plain guidance for every applicant are fine.
7. Ideas for later, not decided: learner enquiries forwarded to providers from the register; positioning of "certificates included" against peers that promise unlimited certificates to members (to be checked against LIV's real cost per verified certificate before any change to `FEES-REVIEW.md` §9).
8. Their footer shows company registration, address, confidentiality and privacy statements; LIV's email footer text comes from counsel.

### 4.2 Title (course) request: proposed fields for F2, compared with a peer (owner shared October 19, 2026)

The owner shared the "Get CPD Ready" guide of the CPD Standards Office, a peer that accredits **each activity** and says a change of title may start a new assessment. It is a course-level questionnaire, while the application in §4.1 is provider-level. LIV's title request sits between them: a short suitability check inside an authorized scope, not an assessment of teaching quality.

| Peer asks | LIV title request |
|---|---|
| Title (per activity; a title change may start a new assessment) | **Asked.** Title in English; a changed title is a new request |
| At least five learning objectives | **Asked** (proposed minimum 3, written as what a learner can do) |
| Audience by role, industry, seniority; prior skills and knowledge | **Asked** (audience, entry requirements) |
| Detailed agenda or timings; duration | **Asked** (duration and agenda; they support completion checks and batch registration) |
| Delivery | **Asked** (mode, language, platform or site; checked against the authorized scope) |
| Authors, instructors and their qualifications | **Asked**, linked to the trainer records (C3) |
| Materials list; sample material | **Asked** (list; a sample where the subject or risk calls for it) |
| Completion rules | **Asked** (attendance and completion; no exam for the Training Completion Credential) |
| How often materials are reviewed, who approves changes, change records | **Asked** (version control of the title) |
| Welcome documents and registration information | **Asked** at provider level (learner terms published before enrollment, C7) |
| Business policies: health and safety, equal opportunities, data protection, disability discrimination | **Moved to the provider application**, stage 4 (list of policies, C7 and C8) |
| Marketing approach, channels, samples of marketing materials | **Moved to the provider application**, stage 4 (channels, C9), plus marketing samples as C9 documents; each title is also checked for wording that implies a professional status |
| Value gap, collaboration, consolidation, evaluation of impact, feedback | **Not required.** These judge teaching design; LIV does not accredit teaching quality. They may be offered as optional information, never scored |

Title request, 14 fields proposed: title; subfield within the scope; summary (what it covers and why it matters to the learner); learning objectives (3 or more); audience; entry requirements; duration; agenda; delivery mode, language and platform or site; responsible trainer (chosen from the trainer records); authors; materials list; completion rules; version and review arrangement. Review outcomes as in the memo: authorized, needs changes, needs wider review, needs scope expansion, refused with a reason.

Proposed additions to the application (stage 4): a list of the provider's policies (health and safety, equal opportunities, data protection, disability), marketing channels (website, social handles, third-party channels), and C9 marketing samples.

**Readiness guide.** The peer sends a free "get ready" guide to every enquirer. LIV can publish its own, generated from the real fields and open to everyone equally (Batch G). It must stay a guide to what is asked and how documents should look, never help to obtain the authorization, for the conflict-of-interest reason in `FEES.md` §1.

## 5. Decision, conditions and impartiality
- **Separation of roles.**
  - The assessor and the decision-maker are different individual accounts. The server refuses a decision by the user who recorded the assessment.
  - At least two named people are needed **[P-2]**.
- **Declared interests.**
  - Before assigning, the assessor and the decision-maker declare interests in the applicant: ownership, employment, training, marketing or referral links.
  - Any declared interest means recusal, and the recusal is recorded.
  - Staff also renew a yearly declaration (existing `qms_declarations`).
- **Decision outcomes.** Accepted, accepted with conditions, or declined. Each decision records:
  - reasons;
  - the criteria version used;
  - the evidence version relied on.
- **Conditions.** Each condition is one of two types:
  - **Blocking:** must be met before activation.
  - **Non-blocking:** activation is allowed with stated, public restrictions and a due date.

  Missing a due date never extends it silently. Any extension is a recorded decision.
- **Appeals.** Appeals use the existing complaints and appeals cases. An open appeal does not restore issuance rights.
- **Referral agents.** An agent who introduced the applicant must be disclosed. Agents have no role in the assessment or the decision.

## 6. Activation checklist (all items required)
1. Acceptance recorded, with no open blocking condition.
2. The active Partner Agreement accepted. Counsel's text is required **[P-7]**.
3. Authorized scope(s) recorded (§7), each with at least one eligible trainer on record (C3).
4. Account security: the partner's administrators have two-factor sign-in on **[P-4]**. Individual accounts only, no shared logins.
5. Billing details complete. Any fee due under the fee policy **[P-6]** is settled. Settlement alone never activates.
6. A test issuance with test identifiers that are never presented as real credentials, checked by LIV.
7. A LIV staff member, not the applicant, confirms the checklist and activates. The system records the activation date and who activated.

## 7. Authorization (scope) rules
- **Content of a scope:** entity, course and version, delivery mode, language, site where required, approved trainers, valid-from and valid-until dates, restrictions. The launch set of fields is decision **[P-3]**.
- **Statuses:**
  - `active`;
  - `active_restricted` (public restrictions shown);
  - `suspended`;
  - `withdrawn`;
  - `expired`, derived from the end date and never stored as a guess.
- **No inheritance.** Authorization does not pass to sister companies, branches, subcontractors or custom courses unless each is added to a scope by decision.
- **Server-side eligibility at every channel.**
  - Issuance through the portal, CSV, Excel, Sheets or the API is refused unless:
    - the partner is active;
    - an active or active-restricted scope covers the course, at the time of execution.
  - A deferred batch is re-checked when it runs, not only when it is uploaded.
- **Dates.** Each record carries the training date, the completion date and the issuance request date. The policy for late requests (training completed inside a scope that has since ended) is decision **[P-8]**.
- **Public register.** The register never shows a scope wider than the one authorized. Internal details (trainer names, evidence) are not public.

## 8. Historical evidence of the partner's status at issuance
The partner's status at the moment of issuance must be **recorded**. It is never inferred from the current status.
- **Credentials issued from now on.** At issuance, the system stores an append-only snapshot with each credential:
  - partner status;
  - scope id, scope status and validity;
  - the decision or activation reference;
  - the timestamp.

  The snapshot is part of the issuance record and is never updated.
- **Credentials already issued.** Their partner status at issuance is reconstructed only from recorded evidence:
  - audit-log entries for partner status changes (`platform.status.*`);
  - scope creation and status entries;
  - the issuance batch record.

  Where no evidence exists, the value is shown internally as "not recorded". It is never filled with today's status. The historical PDFs are not touched.
- **On the verification page, three facts are separate:**
  1. LIV has verified the integrity of the record (HMAC signature, checked by LIV).
  2. The credential's own status.
  3. The provider's status. This shows both the status at issuance, where recorded, and the status today.

  If the current status cannot be read, the page says verification is temporarily unavailable. It does not show a cached "valid".

## 9. Existing partners: inventory before enforcement
Blocking out-of-scope issuance (Batch B) is preceded by an inventory and an impact report:
1. **List** every partner with status `active`: its scopes (title, dates, status, basis note) and its certificate templates.
2. **Collect** the distinct course names issued by each partner over a look-back window **[P-10]**, with counts.
3. **Match** each course name to an active scope. Report:
   - matched names;
   - unmatched names (these would be blocked);
   - partners with no scope at all.
4. **Write the impact report:** which partners and courses would stop, and how many issuances that would have affected over the window.
5. **Owner decision** on notice and timing **[P-1]**:
   - LIV records missing scopes through the normal decision route, with a basis note;
   - enforcement starts on the notified date.
6. **No retroactive effect.** Credentials already issued keep their records and their verification pages.

The inventory is read-only and is delivered as a report before any enforcement code is switched on.

## 10. Monitoring, change and renewal
- **Periodic review.** At least yearly, using the existing partner reviews. The interval is decision **[P-11]**.
- **Risk-based reviews.** In addition, a special review is triggered by:
  - a new partner's first issuances;
  - a large expansion of scope;
  - a significant complaint;
  - anomalies in batch data;
  - a partner's notice of material change: trainer, ownership, site, platform or materials.

  Partners must notify material changes within a period **[P-12]**.
- **Nonconformities.** Each is recorded with its cause, corrective action, owner, due date and a check that the action worked (existing corrective actions).
- **Renewal.** A renewal is a review request. Paying a renewal invoice alone does not renew a scope.
- **Suspension, withdrawal and closure.**
  - The register and the provider status on affected verification records update.
  - Issued credentials stay verifiable.
  - A learner-protection route is defined for learners in training at the time **[P-13]**.

### 10.1 Audits triggered by indicators (owner decision, October 18, 2026)

An audit opens whenever indicators show a contradiction, a sudden change, repeated errors by one provider, or many complaints about one provider. The same triggers apply to every provider and every level; nothing a provider pays changes whether an audit opens. The numbers below are proposed starting values **[P-19]**.

**Indicators (detected by fixed rules, not by judgement):**
| # | Indicator | Proposed trigger |
|---|---|---|
| 1 | Volume jump | One batch of more than 5 times the provider's average monthly issuance, or more than half of its annual included allowance |
| 2 | Repeated errors by the same provider | 3 or more rejected or corrected batches within 90 days; or 3 or more corrections or re-issues after 30 days within 12 months |
| 3 | Contradictions in the data | Completion before the start of the course or after the end of the authorized scope; the same person certified twice for the same course; one identity under several names; completions that do not fit the course length (for example a multi-day course with every completion on one day); a trainer, language, delivery mode or site that does not match the scope |
| 4 | Complaints | 3 or more complaints about the same provider within 90 days, or one complaint alleging false records or a false certificate |
| 5 | Verification anomalies | A cluster of failed or tampered-record verification attempts on one provider's certificates |
| 6 | Unreported material change | A change of trainer, ownership, site or platform found without a notice |
| 7 | Public claims | Marketing that claims accreditation, approval or recognition LIV has not granted, or misuses the badge |

**Steps (each moves up only if the one before leaves the question open):**
1. **Flag:** the system records the indicator on the provider's file. A staff assessor reviews it within 5 working days and, if needed, asks the provider for documents (answer within 10 working days).
2. **Sample review:** the batch or batches are compared with the training evidence (attendance, completion records, trainer records).
3. **Special review:** remote by default, on site only when needed. Fees as in `FEES.md` (charged to the provider only when the trigger was not LIV's own error).
4. **Interim measure:** where records may be false, the Authorization Decision-Maker, a different person from the assessor, may pause new issuance in the affected scope while the review runs. This is a recorded decision with reasons, never a payment matter.

**Outcomes:** closed with no finding; minor nonconformity with a dated corrective action; major nonconformity with scope suspension until closed; confirmed false records, when the affected certificates are revoked through the existing revocation process and authorization is suspended or withdrawn. A repeated or confirmed finding also freezes or lowers the partnership level (`PARTNER-LEVELS.md` §6). Certificates stay valid unless the review shows their records do not match the training.

**Rules:** the provider is told the reasons and may answer and appeal; the complainant's identity is not disclosed to the provider; everyone involved declares interests as for applications; every step is written to the locked application and audit history. Built in Batch H.

## 11. Privacy and accessibility baseline (part of the design)
- **Data minimization.** Collect only the evidence a criterion needs. The public register shows organization-level data only.
- **Evidence storage.**
  - Evidence is stored privately using the existing durable file store.
  - Files are readable only by the applicant organization's authorized users and assigned LIV staff.
  - No public URLs.
  - Allowed file types and sizes are enforced, and file content is checked.
  - Every download is logged.
- **Tenant isolation.** A partner can never reach another partner's applications, evidence, batches or invoices by direct link or API. This is tested in Batches D and F.
- **Roles.** Partner account manager, academic lead, records uploader and finance are planned roles (Batch I). Partner access never includes changing a scope, approving a trainer or editing credential wording.
- **Records.**
  - Sanctions screening records keep the list source and date, the result, the reviewer and how any possible match was resolved. A similar name is never an automatic refusal.
  - Retention periods for applications and evidence are decision **[P-14]**.
- **Verification privacy.**
  - Lookup is by credential ID. There is no open name search.
  - The PDF is available only with the QR token, as today.
  - Bulk verification, when built, requires authorized access, rate limits, minimal fields and an access log.
- **Accessibility.**
  - Target: WCAG 2.2 AA for the application, the dashboards and the verification pages, with no conformity claim until it is tested.
  - Requirements:
    - full keyboard use;
    - visible focus;
    - labels and clear error messages linked to fields;
    - draft saving for long forms;
    - adequate target sizes;
    - no time limits on forms;
    - right-to-left readiness for Arabic.

## 12. Pending owner decisions
| # | Decision | Needed for |
|---|---|---|
| P-1 | **Not needed (October 18):** the trial partner and its records were removed; no existing partners | — |
| P-2 | Named assessor(s) and decision-maker(s); at least two people | Batch E |
| P-3 | Scope fields at launch (recommended: course and version, delivery mode, language; trainers per C3) | Batches D, E |
| P-4 | Two-factor sign-in required for partner administrators as an activation condition (recommended: yes) | Batch E |
| P-5 | Trainer and academic-lead thresholds per scope | Batch E |
| P-6 | Fees per stage (application, assessment, any visit, renewal, issuance), currency, refunds. **Proposal drafted October 18 in `docs/FEES-REVIEW.md`, awaiting owner approval; nothing applied** | Batch G |
| P-7 | Partner Agreement text from counsel | Activation of any new partner |
| P-8 | **Decided October 18:** a completion trained inside an active scope may be issued up to 15 days after the scope ends; never later | Batch B |
| P-9 | Transition rule when the criteria version changes during a review | Batch D |
| P-10 | **Not needed (October 18):** no existing partners | — |
| P-11 | Periodic review interval | Batch H |
| P-12 | Time allowed for notifying material change | Batch H |
| P-13 | Learner-protection arrangements on suspension or closure | Batch H |
| P-14 | Retention periods for applications and evidence | Batch D |
| P-19 | **Approved by the owner October 18:** the audit indicator thresholds in §10.1 (5 times, 3 batches, 3 complaints, 90 days, 5 and 10 working days) | Batch H |
| P-15 to P-17 | Partnership levels Bronze, Silver, Gold: promotion thresholds, badge wording, Gold obligations. Proposal in `docs/PARTNER-LEVELS.md`, awaiting owner approval | Batch H |
| — | Public opening of the application (`PUBLIC_APPLY`): recommended to stay off until Batches E and F and P-7 are done | Opening |

## 13. Acceptance scenarios for later batches
1. **B:** Issuance outside an active scope is refused for portal, CSV, Excel, Sheets and API. Suspended or expired scopes are refused too. A deferred batch is re-checked when it runs. Resubmitting a file or retrying an API call does not issue twice.
2. **B:** A valid payment notification does not activate a partner or a scope.
3. **B:** New credentials carry the issuance snapshot (§8). Existing credentials show "not recorded" where no evidence exists.
4. **C:** Suspending a partner later does not show an earlier valid credential as invalid. A failed status read shows "temporarily unavailable", never a cached "valid".
5. **D:** A submitted version and its evidence cannot be changed. A correction creates a new linked version. One partner cannot read another partner's evidence.
6. **E:** The assessor cannot record the decision, even by a direct server request. Activation is impossible while any checklist item, including C3 trainer eligibility, is incomplete.
7. **F:** A full trial application runs from draft to activation by keyboard alone, with draft saving and clear errors.
8. **H:** Paying a renewal invoice does not renew a scope. A material-change notice opens a special review.
9. **Every batch:** Historical PDFs stay byte-identical. Their verification pages keep working.
