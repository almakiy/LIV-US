# Training Completion Credential Policy

- **Title:** Training Completion Credential Policy
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** Learners, holders, ATPs and LIV issuance staff

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Issuer and meaning
LIV LLC issues every LIV credential and holds the official record. A LIV Authorized Training Provider (ATP) delivers training and submits completion information within its authorized scope. The active Training Completion Credential records completion, requires no LIV examination and has no expiry date. It is not a professional qualification, professional certification or occupational license. The other credential classes are not enabled.

## 2. Preconditions
Issuance requires truthful English data, an approved course/title within the applicable scope, an eligible active provider, and the system's issuance checks. Payment or membership does not prove completion. All upload and API channels must follow the same central checks. Providers must retain supporting training evidence for the period eventually approved under P-14.

## 3. Dates and scope
Records preserve actual completion and issuance dates. P-8 permits a request up to 15 days after a scope ends for training completed within the active scope; it does not extend training authorization, allow a suspended provider to issue, or excuse other failed checks. Any contradictory chronology or duplicate requires investigation rather than alteration to obtain acceptance.

## 4. Holder access
Verification and basic access to an issued record do not require paid membership. Safe account linking follows the [Individual Account Terms](individual-account-terms.md); account linking does not change the credential. Public disclosure follows the [Verification Policy](verification-policy.md).

## 5. Corrections and revocation
A holder or provider may request correction with an explanation and supporting evidence. LIV must review the facts, identify the affected record, record its reason and authority, and preserve the historical file and decision trail. A proven material error or false completion may require a documented correction or revocation; suspicion alone is not a final finding. CR01 must approve notice, response, replacement/reference and appeal procedures before routine use. Existing PDFs must not be silently regenerated.

## 6. Unrelated status changes
Later provider suspension, a provider's debt, or the holder's membership expiry does not itself invalidate a prior credential. No claim of lifetime storage or unlimited availability follows from the credential's lack of expiry. Retention is governed by the [Records Retention Schedule](records-retention-schedule.md).

## 7. Concerns
Use /contact or account support. Reviews and appeals follow the [Complaints and Appeals Policy](complaints-and-appeals-policy.md); pending disputes do not automatically establish validity or invalidity.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **CR01 (P0):** [TO BE CONFIRMED BY COUNSEL: Correction/revocation policy: grounds, authority, notice, response, replacement records, costs and appeal safeguards.] Reason: The owner permits documented corrections; older documents contain absolute historical-preservation wording.
- **CR02 (P0):** [OWNER DECISION: Resolve the legacy credential-model issuer/examination conflict without changing historical records.] Reason: CREDENTIAL-MODEL.md conflicts with the fixed active model.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: docs/DECISIONS.md; docs/PARTNER-AUTHORIZATION.md P-8; docs/CREDENTIAL-MODEL.md; src/lib/verify.js; src/lib/individuals.js. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
