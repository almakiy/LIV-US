# Cookie and Local Storage Notice

- **Title:** Cookie and Local Storage Notice
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** Visitors and signed-in users

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Scope
This inventory covers application source, not every production-hosting addition or the external Stripe Checkout page. No analytics or advertising cookies are invented.

## 2. Inventory
| Item | Type | Purpose | Duration |
|---|---|---|---|
| liv.sid | Session cookie | Link the browser to its server-side session | Configured maximum age: 8 hours |
| liv.announce.hidden | Local storage | Remember dismissal of the membership announcement | No timed expiry; the banner returns when the announcement identifier changes |

The session cookie is HttpOnly and SameSite=Lax; Secure depends on production configuration. Sessions are stored server-side in PostgreSQL. Local storage is not a cookie. Announcement dismissal is not tracking consent.

## 3. Choices
Browser controls can clear/block storage. Removing the session cookie can interrupt sign-in. Clearing the announcement preference displays the banner again. Neither action changes newsletter or offers consent.

## 4. External services and changes
Checkout is hosted separately by Stripe. CK01 must inventory deployed storage and confirm external notices before publication. No unverified provider cookie names or lifetimes are stated. Repeat the inventory before adding embeds, analytics or other storage; legal classification and consent requirements remain CK02.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **CK01 (P0):** [OWNER DECISION: Verify deployed storage, provider notice links and secure production settings.] Reason: Source cannot show all external storage.
- **CK02 (P0):** [TO BE CONFIRMED BY COUNSEL: Storage classification and jurisdiction-specific notice/consent duties.] Reason: Functional purpose alone does not settle exemptions.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: src/app.js:35–42; public/app.js:29–40. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
