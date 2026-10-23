# Data Processing and Data Sharing Addendum

- **Title:** Data Processing and Data Sharing Addendum
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** LIV LLC and the ATP identified in its agreement

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Purpose and status
This addendum governs personal information exchanged for the ATP relationship after completion and adoption. It must distinguish processing on another party's instructions from independent controller activities. Labels in a database or a template do not determine legal roles.

## 2. Per-flow role schedule
The following are working characterizations for counsel, not settled role allocations.

| Flow | Determination required |
|---|---|
| ATP enrollment, delivery, attendance and trainer management | Assess ATP as controller for its own training purposes; LIV role depends on any actual access/purpose |
| Completion report supplied to LIV | Assess controller-to-controller disclosure where each determines its own purpose; identify any limited processing solely on ATP instructions |
| LIV issuance, official record, verification and integrity | Assess LIV as controller of its official record; do not assume ATP can order its unrestricted deletion |
| Partner application, review, sanctions records and authorization | Assess LIV's own controller purposes and ATP's disclosure obligations |
| Individual accounts, membership, direct purchases, consents and support | Assess LIV's controller purposes; no general ATP access or control |
| Group seats | Assess sponsoring organization's disclosure purpose and LIV's administration purpose; manager access remains limited |
| Hosting, storage, email and payment | Confirm each vendor's actual legal role and contract; PostgreSQL is technology, not a legal entity |

DA01 must finalize each row. If activities constitute joint control, adopt the required allocation rather than relabeling them as simple processor services.

## 3. Data and purposes
Complete DA02 with data subjects, categories, special/sensitive categories if genuinely needed, operations, duration, purposes and lawful bases. Use the minimum data needed for training evidence, review, issuance and related administration. Do not submit unrelated learner records or assume full identity documents are always required. English input rules do not remove data-protection obligations.

## 4. Controller-to-controller flows
Each controller must have a lawful basis, provide appropriate notices, secure its processing and respond to applicable rights. Parties cooperate on accuracy and linked record concerns without allowing one party to rewrite the other's legally required records. Public verification disclosures follow the adopted [Privacy Policy](privacy-policy.md) and [Verification Policy](verification-policy.md).

## 5. Where a processor relationship is confirmed
The processor acts only on documented lawful instructions within the completed schedule, including transfers, and alerts the controller to an instruction it believes unlawful. Authorized people must be bound by confidentiality. The processor maintains appropriate security, assists with rights requests, incidents and legally required assessments, supplies information needed to demonstrate its obligations, and permits agreed proportionate audits.

Subprocessors require the approved authorization/change process and equivalent relevant obligations. At service end, return or delete data as instructed and legally permitted, subject to documented required retention. DA03 must supply instruction channels, audit arrangements, subprocessor details and operational procedures; no incomplete clause is represented as a signed compliant DPA.

## 6. Security and incidents
Use role-based access, controlled evidence access, appropriate authentication and traceable actions consistent with the actual system. Incident cooperation follows the [Security and Incident Notice](security-and-incident-notice.md). DA04 must set notification timing/content and responsible contacts consistent with applicable law. No unverified encryption, residency or recovery guarantee is made.

## 7. Transfers and vendors
DA05 must identify hosting/support/backup locations, contracted entities and any required transfer instrument. The use of cloud hosting or Stripe does not itself establish a lawful international transfer. Do not list an uncontracted email or other vendor as an appointed subprocessor.

## 8. Requests, retention and end of service
Route requests to the responsible party and coordinate without unnecessary duplication of identity evidence. P-14 and the [Records Retention Schedule](records-retention-schedule.md) must be completed. Holds require a documented justification and periodic review; no indefinite blanket retention follows from immutable-record technology.

## 9. Precedence and adoption
DA06 must settle precedence, liability, regulator cooperation, signatures and incorporation into Annex D. The parties must receive the exact completed version before acceptance.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **DA01 (P0):** [TO BE CONFIRMED BY COUNSEL: Final controller, joint-controller or processor classification for every listed flow.] Reason: Technical functions alone do not determine legal roles.
- **DA02 (P0):** [TO BE CONFIRMED BY COUNSEL: Processing schedule: subjects, data, purposes, bases, operations, duration and sensitivity.] Reason: No completed processing inventory.
- **DA03 (P0):** [TO BE CONFIRMED BY COUNSEL: Instructions, audits, confidentiality, subprocessors and return/deletion procedures.] Reason: Processor obligations need executable contractual arrangements.
- **DA04 (P0):** [TO BE CONFIRMED BY COUNSEL: Incident and rights-assistance contacts, deadlines and responsibilities.] Reason: No approved response timing for data incidents.
- **DA05 (P0):** [TO BE CONFIRMED BY COUNSEL: Actual recipient/location inventory and transfer safeguards.] Reason: No verified hosting region or signed transfer instrument.
- **DA06 (P0):** [TO BE CONFIRMED BY COUNSEL: Precedence, liability, execution and completed Annex D incorporation.] Reason: This is a draft, not an operative DPA.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: docs/PARTNER-AUTHORIZATION.md C8; docs/INDIVIDUALS-PORTAL.md; docs/BILLING.md; src/lib/individuals.js; gifts.js; verify.js; retention.js. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
