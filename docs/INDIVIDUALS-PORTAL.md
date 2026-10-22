# Individuals portal, membership and related services

Scope reference: owner instruction of October 22, 2026 (individual accounts, membership, benefits, products, gifts, group packs, communication). The detailed scope file named in that instruction was not attached to the session; this plan follows the requirements written in the instruction itself and will be reconciled with the file when it is provided.

## Governance rules (fixed)
1. Membership is optional and separate from credentials, eligibility and assessment results. No membership or preparation purchase is required to apply for an available assessment.
2. Paid membership may activate automatically after a confirmed payment; this never issues a credential or accepts an assessment application.
3. Basic access to issued credentials (list, verification link, PDF) never needs a paid membership, and survives the end of a membership.
4. The Training Completion Credential stays without an exam and without expiry. Assessed qualifications and professional certifications, and their fees, stay disabled until their programs are approved and operating.
5. The membership card and badge state membership only: no professional qualification and no external accreditation.
6. Ordinary operations are delegated to LIV staff; real exceptions stay with the main account (existing `policy_exceptions`), with reason, scope, period and record.
7. No ISO claim or conformity claim is made on the strength of these features.
8. All input and issued data are in English.

## M0. Requirements against the code (October 22, 2026)
| Need | Exists | Gap |
|---|---|---|
| Accounts, sign-in, 2FA, password change, sessions | `users`, `auth.js`, `account.js`, TOTP, forced change | Role for individuals; public sign-up; email verification; password reset for individuals |
| Credentials and verification | `certificates` (recipient email kept privately), `/verify`, `/verify/:cert/pdf` | Link a credential to a person without touching the certificate row or its PDF |
| Payments and invoices | `billing_*`, `invoices` (per provider), `payments`, Stripe webhook with signature check | Invoices for a person (M2); idempotent activation on payment (M2) |
| Discounts | `billing_discounts` with reasons | Membership discounts (M2) |
| Email | `email_outbox` with retries, dedupe and suppression | Templates for individuals; marketing consent kept apart from service mail |
| Support | `contact_messages`, Admin > Messages, complaint and appeal cases | Link a message to the signed-in person |
| Audit, backups | `audit_logs`, provider-managed backups | None for M1 |
| Exceptions | `policy_exceptions` (main account only) | Reused as is |
| Partner levels and badges (ATP) | Built | Out of scope; not changed |

## Order
- **M1 (this batch):** individual account (sign-up behind `INDIVIDUAL_ACCOUNTS`, email verification, password reset), safe credential claim and link, individual dashboard, support and privacy (data export, closing request, marketing consent kept apart).
- **M2:** membership plans as configurable records with versioned price, terms and benefits (no prices invented; plans stay unsellable until approved), individual invoices and payment, renewal and cancellation, membership card and its verification.
- **M3:** resources, products, library, newsletter (consent-based), events.
- **M4:** gifted memberships and group packs with seat management (managers never see members' credentials).
- **M5:** add-on packs and optional preparation, linked to assessments only once those programs operate.

Order within M1: the claim depends on email verification, so verification comes first; support and privacy reuse existing tables.

## Safe claim rule (M1)
A person links a credential only when:
1. **Email match:** the credential's recipient email (recorded privately by the provider at issuance) is one of the person's verified email addresses. The public certificate number or a name match alone is never enough.
2. **Staff review:** otherwise the person sends a request with the number and an explanation; LIV staff approve or refuse it with a recorded reason.
A credential links to one account at a time (database-enforced). Linking never changes the certificate, its record hash or its PDF.

## Pending decisions (collected for the owner)
- I-1. Individual terms and privacy notice text (counsel) before `INDIVIDUAL_ACCOUNTS` is turned on in production.
- I-2. Retention period and process for closing an individual account (joins P-14).
- I-3. Sending email needs the SMTP provider and SPF, DKIM, DMARC records (same as the partner gateway); without it, verification and reset messages stay queued.
- I-4 (M2). Membership plan names, prices, periods, benefits, discounts and refund policy.
- I-5. The scope file named in the instruction of October 22 was not attached; it is needed to confirm M2 to M5 details.

## Progress
- October 22, 2026: M0 mapping written.
- October 22, 2026: **M1 done.** Individual accounts (role `individual`; sign-up at `/signup` behind `INDIVIDUAL_ACCOUNTS`, off by default; email confirmation; password reset by email for individual accounts only; same answer whether or not an address has an account). Safe credential link (`credential_claims`, one active link per credential enforced by the database; email match on confirmed addresses, extra addresses confirmed by link; otherwise a staff-reviewed request with a recorded reason at Admin > Individuals). Dashboard `/me`, credentials with verification link and PDF, profile with a separate dated marketing choice, support linked to the account, data export (JSON) and closure request. Individuals cannot reach the provider portal or admin; providers cannot reach `/me`.
- October 22, 2026: **Preview accounts** (owner request): Admin > Preview accounts. The main account creates and opens a preview training provider (active, one preview scope, preview template) and a preview individual (no membership); the membership preview is listed as available with M2. Preview records stay out of the public register, number lookup and sitemap, verify as "preview record" with no details and no public PDF, open no audit case, and preview addresses never receive email. Automatic read-only checks and a manual check log.
- Tests: 664 end-to-end checks and 133 unit tests pass.
- Next: M2 (membership plans as configurable, versioned records; nothing sellable until approved).
