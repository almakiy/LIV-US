# Credential and Membership Verification Policy

- **Title:** Credential and Membership Verification Policy
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** Holders, members, employers, partners and public verifiers

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Meaning
Public verification is free. LIV checks its official record; this does not independently establish every underlying training event or occupational competence. Completion, membership and future professional awards are distinct.

## 2. Credential results
Results include valid, revoked, not found, invalid format, tampered, temporarily unavailable and preview. Valid means the stored record passed the implemented integrity check and is not revoked. Tampered indicates an integrity/token issue, not an automatic finding of holder fraud. Not found does not prove someone never trained. Unavailable must not appear as valid. Preview records are tests and disclose no real credential details.

## 3. Fields and access
Public fields include number, holder name, course, completion/issue dates, record type/status and provider details; revocation date may appear. Email and full identity number are not public. Public PDF access uses the appropriate token. A bare number/name is insufficient for account ownership; see [Individual Account Terms](individual-account-terms.md).

## 4. Separate status
Display credential status separately from recorded provider/scope status at issuance and today's status. Never infer missing historical status. Later provider suspension, billing hold or membership expiry does not itself revoke a previously issued credential.

## 5. Membership checks
Results identify active/not active or no matching record. Active results show plan/end date. Names appear only by member choice. Membership is not competence, professional certification or ATP authorization.

## 6. Problems
Use /contact or signed-in support to report suspected errors. Follow the [Credential Policy](credential-policy.md). Shared links do not authorize unrelated harvesting or profiling.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **VF01 (P0):** [OWNER DECISION: Resolve legacy API issuer wording and verify public presentation.] Reason: The compatibility issuer field still names the provider.
- **VF02 (P1):** [TO BE CONFIRMED BY COUNSEL: Public field necessity, verifier reuse and error notice wording.] Reason: Public access does not eliminate privacy obligations.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: src/lib/verify.js; src/lib/memberships.js:verifyPublic; docs/BUILD-PLAN.md Batch C. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
