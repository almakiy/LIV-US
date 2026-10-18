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
| P-6 | Fees per stage (application, assessment, any visit, renewal, issuance), currency, refunds | Batch G |
| P-7 | Partner Agreement text from counsel | Activation of any new partner |
| P-8 | **Decided October 18:** a completion trained inside an active scope may be issued up to 15 days after the scope ends; never later | Batch B |
| P-9 | Transition rule when the criteria version changes during a review | Batch D |
| P-10 | **Not needed (October 18):** no existing partners | — |
| P-11 | Periodic review interval | Batch H |
| P-12 | Time allowed for notifying material change | Batch H |
| P-13 | Learner-protection arrangements on suspension or closure | Batch H |
| P-14 | Retention periods for applications and evidence | Batch D |
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
