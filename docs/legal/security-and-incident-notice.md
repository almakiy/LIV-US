# Security and Incident Notice

- **Title:** Security and Incident Notice
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** Users, partners, affected individuals and LIV incident handlers

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Controls and limits
The inspected application includes role/access controls, two-step sign-in capability, controlled evidence access, signature-checked payment notifications and audit records. The audit log is append-only under application/database controls and hash-chained. This is tamper evidence, not absolute immutability: privileged database administration can undermine it, as QMS documentation explains. Secure deployment, backups and configuration require verification.

## 2. Reporting
Use /contact or the agreed partner support route for a suspected security concern, stating the affected service, time and observed behavior. Do not include passwords, raw card data or unnecessary personal records. SC01 must establish a monitored security contact and backup escalation method before public reliance on this notice.

## 3. Authorized handling
The designated team should log the report, preserve relevant evidence, assess urgency, contain unauthorized access, investigate scope and coordinate recovery. Limit access to incident information. Do not destroy evidence through indiscriminate record deletion or restore altered facts as valid.

## 4. Notification
SC02 must define legal/contractual notification duties, recipients, triggers and deadlines for applicable jurisdictions. No unsupported universal deadline is invented. Affected persons should receive the information legally required and practical steps relevant to them. Unverified allegations must not be presented as confirmed breaches.

## 5. Partner cooperation
ATPs must use the completed DPA/incident arrangements when learner information is affected. Record information supplied, actions taken, decisions and communications. A provider report does not by itself establish liability or automatically revoke credentials.

## 6. Recovery and improvement
Confirm restored access and integrity, retain the incident decision trail under approved rules, and track corrective actions. This notice promises no absolute security, fixed recovery time, backup frequency or security certification.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **SC01 (P0):** [OWNER DECISION: Incident owner, monitored contact, backup route and response procedure.] Reason: No dedicated verified incident contact or deployment operation.
- **SC02 (P0):** [TO BE CONFIRMED BY COUNSEL: Breach assessment, notification deadlines/recipients, documentation and contractual cooperation.] Reason: Requirements depend on jurisdictions and roles.
- **SC03 (P0):** [OWNER DECISION: Validate production access, 2FA, secrets, hosting/backups, restoration and audit-log protections.] Reason: Source features do not prove secure production configuration.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: docs/QMS-RECORDS.md; docs/HANDOFF.md; docs/BILLING.md; src/lib/applications.js; src/app.js. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
