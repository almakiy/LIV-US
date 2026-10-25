# Records Retention Schedule

- **Title:** Records Retention Schedule
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** LIV record owners, privacy staff and ATPs for their related records

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Status
P-14 and I-2 remain unresolved. This is an inventory and proposed trigger framework, not permission to keep everything forever or delete records now. No retention duration is adopted. A lawfully necessary hold must identify its reason and owner; immutable software structures do not override applicable rights.

## 2. Inventory and proposed triggers
All entries below require a completed duration, legal basis, owner confirmation and disposal method under RT01. Trigger descriptions are drafting proposals, not existing automatic deletion behavior.

| Record class | Repository location/function | Proposed trigger for review | Duration |
|---|---|---|---|
| Partner applications, versions and decisions | partner_applications and related version/event tables | Final decision/relationship end, according to purpose | [TO BE CONFIRMED BY COUNSEL: RT01 application period] |
| Private evidence and trainer documents | partner_application_evidence; stored_files; trainer records | Supersession or end of relevant scope/application | [TO BE CONFIRMED BY COUNSEL: RT01 evidence period] |
| Approved scopes, titles and authorization history | scope/title records | Scope end or replacement; preserve necessary issuance linkage | [TO BE CONFIRMED BY COUNSEL: RT01 scope period] |
| Credentials and original PDFs | certificates; stored files | Issuance and ongoing official-record purpose | [TO BE CONFIRMED BY COUNSEL: RT01 credential period] |
| Refused uploads | issuance_refusals | Attempt date or case closure | [TO BE CONFIRMED BY COUNSEL: RT01 refusal period] |
| Monitoring cases | partner_audit_cases/events | Final action and closure | [TO BE CONFIRMED BY COUNSEL: RT01 monitoring period] |
| Complaints, appeals and corrective actions | qms_cases and QMS registers | Final decision/remedy closure | [TO BE CONFIRMED BY COUNSEL: RT01 QMS period] |
| Material changes and renewals | partner_material_changes; renewal records | Decision and affected relationship end | [TO BE CONFIRMED BY COUNSEL: RT01 change period] |
| Sanctions screening | partner_sanctions_checks | Screening date and final disposition | [TO BE CONFIRMED BY COUNSEL: RT01 sanctions period] |
| Exceptions | policy_exceptions | Expiry/consumption and related case closure | [TO BE CONFIRMED BY COUNSEL: RT01 exception period] |
| Agreements and acceptances | agreements; agreement_acceptances | Supersession/termination and relevant claims | [TO BE CONFIRMED BY COUNSEL: RT01 agreement period] |
| Invoices, payments, credits and refunds | invoices; payments; external adjustment evidence | Transaction/accounting closure | [TO BE CONFIRMED BY COUNSEL: RT01 financial period] |
| Accounts and verified addresses | users; individual_emails | Closure request/final service end | [TO BE CONFIRMED BY COUNSEL: RT01 account period] |
| Credential links and claims | credential_claims; credential_claim_requests | Release or claim decision | [TO BE CONFIRMED BY COUNSEL: RT01 claim period] |
| Membership terms, events and cards | membership tables | Term end and later dispute closure | [TO BE CONFIRMED BY COUNSEL: RT01 membership period] |
| Gifts, campaigns, group packs and seats | gifts; group_packs; group_seats | Redemption/expiry/closure | [TO BE CONFIRMED BY COUNSEL: RT01 gift/group period] |
| Resource purchases and licenses | resources; resource_purchases | Access end or ongoing paid entitlement | [TO BE CONFIRMED BY COUNSEL: RT01 resource period] |
| Consents and suppression evidence | communication_consents; user preferences; suppression records | Withdrawal and evidence purpose | [TO BE CONFIRMED BY COUNSEL: RT01 consent period] |
| Waitlists/program interest | membership_waitlist; program_interest | Departure, conversion or closure | [TO BE CONFIRMED BY COUNSEL: RT01 interest period] |
| Events and contributions | event/registration/contribution records | Event end or publication/rights lifecycle | [TO BE CONFIRMED BY COUNSEL: RT01 community period] |
| Support and privacy requests | contact_messages; closure_requested_at | Final handling and necessary follow-up | [TO BE CONFIRMED BY COUNSEL: RT01 support period] |
| Queued/sent email | email_outbox | Delivery/failure and evidence purpose | [TO BE CONFIRMED BY COUNSEL: RT01 email period] |
| Verification lookups | verification_logs | Lookup date or investigation closure | [TO BE CONFIRMED BY COUNSEL: RT01 verification-log period] |
| Audit records | audit_logs | Action and continuing integrity/legal purpose | [TO BE CONFIRMED BY COUNSEL: RT01 audit period] |
| Sessions, tokens and backups | sessions; individual_tokens; provider backups | Expiry/invalidation or backup cycle | [TO BE CONFIRMED BY COUNSEL: RT01 technical/backup period] |

## 3. Access and disposal
Owners must limit access and avoid redundant evidence copies. Before disposal, verify the schedule, lawful hold, affected official records and any required notice. Record authorization, scope and outcome. Methods must cover database rows, stored files, exports and backups as applicable. RT02 must resolve constraints imposed by locked records and restore procedures.

## 4. Closure versus deletion
An application closed after inactivity is not necessarily deleted. Existing 30/90-day reminders and 180-day stale-draft closure are operational behavior, not an approved general retention period. Token expiry likewise does not prove token-row deletion. Account closure is a request workflow.

## 5. History and non-expiring credentials
Preserve truthful historical records and original PDFs according to the approved legal schedule. Do not infer infinite evidence retention from no credential expiry. Where erasure and integrity conflict, seek a documented lawful solution rather than deleting history indiscriminately or refusing every request.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **RT01 (P0):** [TO BE CONFIRMED BY COUNSEL: P-14/I-2 periods, purpose/legal basis, triggers and owners for every inventory row.] Reason: No approved retention durations; current module covers only part of the later individual data.
- **RT02 (P0):** [OWNER DECISION: Implement approved disposal, backup expiry, holds, restores and closure controls in a separate technical task.] Reason: This documentation-only task does not add deletion automation.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: src/lib/retention.js; src/lib/individuals.js; memberships.js; gifts.js; resources.js; community.js; waitlist.js; docs/HANDOFF.md; docs/QMS-RECORDS.md. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
