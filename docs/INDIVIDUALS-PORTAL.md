# Individuals portal, membership and related services

Scope reference: owner instruction of October 22, 2026 and its scope document "LIV — بوابة الأفراد والعضويات والمزايا" (October 22, 2026), kept at `docs/scope/LIV-Individual-Portal-Memberships-and-Benefits-ar.md`.

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
- I-4. Membership: final plan names, prices, periods, benefits and their availability, discounts, renewal and refund terms (the scope document §18). Then turn on `MEMBERSHIP_SALES`.
- I-5. Student status check method before the Student Membership can be sold.
- I-6. Card payment: `STRIPE_SECRET_KEY` and the webhook secret; until then LIV records payments by hand (memberships) and resources, gifts and packs wait for card payment.
- I-7. Resources: which guides, templates and tools to publish first, their authors and reviewers, and prices of any sold separately. Then `PRODUCT_SALES`.
- I-8. Newsletter: editorial calendar and owner, the email footer from counsel, the SMTP provider and SPF, DKIM, DMARC. Then `NEWSLETTER_SENDING`.
- I-9. Events: the first sessions, hosts and joining tool.
- I-10. Gifts: launch campaign budget, months, number of gifts and audience; acceptance period of paid gifts (built: 90 days).
- I-11. Group packs: seat transfer and cancellation terms, minimum seats (built: 5 for the corporate plan), and what the purchasing organization may see (built: seat address and status only).
- I-12. Contribution terms: rights and attribution for accepted contributions (counsel).

## Proposed starting prices (owner request, October 22, 2026)
Written into the draft terms only. The main account approves them in Admin > Memberships; until then nothing is sold. The refund line in the draft terms stays open for counsel, so the terms cannot be approved as they stand.

| Plan | Proposed price | Period | Basis |
|---|---|---|---|
| LIV Member | $195 | 12 months | Within the range of established US professional bodies (ASQ Professional about $185, ASSP member about $180 to $205), above PMI (about $139 to $165) and below SHRM ($299). A round figure, no "$x.99", to read as a professional institution rather than a retail offer. |
| LIV Member Plus | $345 | 12 months | About 1.75 times the core plan; sold only once its extra benefits exist. |
| Student Membership | $49 | 12 months | Above the lowest student rates (ASSP about $15, ASQ about $31, PMI about $32), below SHRM ($75); sold only once a student status check exists. |
| Corporate Membership Package | $165 per named seat | 12 months | About 15% below the core plan; minimum 5 seats; sold with seat management (M4). |

Reference figures come from public web sources gathered on October 22, 2026; several are third-party summaries and should be checked on each body's site before the prices are published. They are a market reference only: LIV does not copy another body's prices or products.

Before approval: compare each price with the cost of the benefits actually delivered (support, library, sessions), and confirm the refund and renewal terms with counsel.

## Owner decisions, October 23, 2026
The owner approved the proposals:
- Plan names as proposed: LIV Member, LIV Member Plus, Student Membership, Corporate Membership Package.
- Starting prices as proposed: $195, $345 and $49 a year; $165 per named seat a year, minimum 5 seats.
- Paid gifts can be accepted for 90 days. Group managers see each seat's address and status only.
Still needed before anything is sold: the refund line in the terms (counsel), the student status check, card payment keys, and the main account's approval of each plan's terms in Admin > Memberships. Then the owner turns on `MEMBERSHIP_SALES` (and `PRODUCT_SALES`, `NEWSLETTER_SENDING` when their own conditions are met).

## Parked for later: premium membership card (owner request, October 23, 2026)
Goal: a card and a public member page refined enough that members share them with pride on LinkedIn and social media.
Proposed scope when the owner reopens it:
- Card design in LIV identity (navy, gold, the LIV seal), engraved-style details, member name, plan, member number, Member since, Founding Member mark, QR to the verification page.
- Downloadable card image (PNG) and PDF; later Apple Wallet and Google Wallet passes.
- A public member page (only what the member chooses to show) with a share image so LinkedIn and other networks display the card in the link preview.
- LinkedIn: share post and guidance to list LIV under "Organizations" (membership), not under "Licenses & certifications".
Limits that stay: the card states membership only; no government-style seals, flags or wording that could pass for an official ID, licence or credential; an expired membership never shows as active.

## Progress
- October 22, 2026: M0 mapping written.
- October 22, 2026: **M1 done.** Individual accounts (role `individual`; sign-up at `/signup` behind `INDIVIDUAL_ACCOUNTS`, off by default; email confirmation; password reset by email for individual accounts only; same answer whether or not an address has an account). Safe credential link (`credential_claims`, one active link per credential enforced by the database; email match on confirmed addresses, extra addresses confirmed by link; otherwise a staff-reviewed request with a recorded reason at Admin > Individuals). Dashboard `/me`, credentials with verification link and PDF, profile with a separate dated marketing choice, support linked to the account, data export (JSON) and closure request. Individuals cannot reach the provider portal or admin; providers cannot reach `/me`.
- October 22, 2026: **Preview accounts** (owner request): Admin > Preview accounts. The main account creates and opens a preview training provider (active, one preview scope, preview template) and a preview individual (no membership); the membership preview is listed as available with M2. Preview records stay out of the public register, number lookup and sitemap, verify as "preview record" with no details and no public PDF, open no audit case, and preview addresses never receive email. Automatic read-only checks and a manual check log.
- Tests: 664 end-to-end checks and 133 unit tests pass.
- October 22, 2026: **M2 done.** Membership plans as records (`membership_plans`, `membership_plan_versions`): the four proposed plans from the scope document are seeded as drafts with no price or period. Staff edit drafts; only the main account approves terms (an approved version is locked by the database) and puts a plan on sale. A plan can be bought only when it is on sale, its terms are approved with price and period, every listed benefit is marked available, it needs no student check or seats, and `MEMBERSHIP_SALES` is on. A purchase creates a pending membership and an individual invoice (existing invoices, Stripe Checkout when configured, or a payment recorded by LIV); full payment activates it once (repeated notices change nothing). Each membership keeps a copy of the terms it was taken on. Renewal is a new purchase starting the day after the current period; nothing renews automatically; "I will not renew" keeps the paid period. Daily expiry and a 30-day reminder. Card with member number, plan, dates, QR and LinkedIn share; public check at `/membership/verify` shows the minimum (name only if the member chooses) and never confirms an expired membership. Admin can suspend with a reason. Counts keep paid, gift, trial and granted apart; preview memberships are left out and granted ones are not revenue. Public pages `/individuals` and `/membership`.
- October 22, 2026: **Preview test data is cleared** (owner request): everything entered in the preview accounts is deleted when the main account signs out, at its next sign-in if a session ended without signing out, or with "Clear preview data now". The preview accounts and their starting setup stay. The append-only audit log keeps the record of actions.
- Tests: 710 end-to-end checks and 139 unit tests pass.
- October 23, 2026: **M3 done.** Resources (`resources`, `resource_purchases`): guides, templates, checklists, articles, tools and preparation products; access free (any account), members (active membership) or purchase (paid, unexpired), decided on the server. Publication only after review by someone other than the submitter; a price is approved by the main account and editing it withdraws the approval; a purchase fixes its price (member price only with an active membership) and access period; repeated payment notices change nothing. Communication: two separate optional consents (knowledge newsletter with topics, offers), each change recorded with source and exact text (`communication_consents`); unsubscribe link stops one channel only. Newsletter issues: drafted, approved by another person (or the main account), sent only by the main account and only with `NEWSLETTER_SENDING`. Events: audience (public, account, members), capacity and date checked in a locked transaction; joining link shown to registered people only. Contributions: proposals with consent to show the name; decided with a note. Public pages `/resources`, `/community`, `/unsubscribe`.
- October 23, 2026: **M4 done.** Paid gifts (plan on sale; code issued after payment; 90 days to accept; resend rotates the code), LIV launch campaigns (approved by the main account: plan, months, number, last date; staff issue inside them with a conflict-of-interest confirmation; code shown once), one-use redemption tied to the recipient's confirmed address. Group packs (`group_packs`, `group_seats`): seats times the approved seat price, minimum seats per plan (corporate 5), invitations up to the number bought, seat memberships end with the pack, withdrawing a seat ends only that seat's membership and frees it. Managers see seat address and status only. Gift and group memberships are never revenue and never renew automatically.
- October 23, 2026: **M5 (ready parts) done.** Free interest list on each assessment program page (`program_interest`; reserves nothing, no payment). Preparation products cannot be sold until linked to a published, operating assessed qualification or professional certification. Add-on packs and direct assessment application wait for those programs.
- Preview accounts clear the M3 and M4 data too (purchases, registrations, contributions, consents, gifts, packs).
- Tests: 764 end-to-end checks and 145 unit tests pass.
- October 23, 2026: **Membership waitlist** (owner decision: start with a waitlist before sales; Founding Member badge only; proposed prices shown as expected prices). Behind `MEMBERSHIP_WAITLIST`. Public form on `/membership` per plan not yet on sale (email, optional name, country and student flag, required consent kept word for word); same answer when already listed; confirmation with a one-click leave link. Admin > Memberships > Waitlist: counts by plan, country and week, students, CSV export, and invitations in batches (main account only, oldest first, only for a plan that can be bought). People on a plan's list before it first went on sale get the Founding Member badge on their card when they join it; no discount. Tests: 781 end-to-end checks.
- October 23, 2026: **Staged launches** (owner decision: one membership at a time, not all shown at once, the waitlist always open and given prominence). Each plan is hidden from the site until the main account announces it; one announced plan at a time leads a site-wide banner (navy and gold, under the top bar, public pages only, a visitor can hide it until the announcement changes, optional custom text). A dedicated waitlist page `/membership/waitlist` leads with the featured plan and its expected price, and also takes people for any future membership. Putting a plan on sale announces it. Tests: 792 end-to-end checks.
- October 25, 2026: **LIV Expert Network** (owner decision; see `docs/BENCHMARK-PECB-ar.md` §11). Account > Expert network: apply as curriculum expert, item writer, technical reviewer, committee member or trainer, with domains, education, experience, optional LinkedIn link, current roles, a conflict-of-interest declaration (or "none"), a confidentiality pledge and the applicant privacy text kept with the application. One open or approved application per track. Admin > Resources and community lists applications, flags impartiality clashes (item writer with trainer; trainer with committee) and records approval or refusal with a note; nobody decides their own. Approval records a role only: no item bank or private record access. Included in data export and preview clearing; described on /community. Also fixed two older test issues (a withdrawn-plan check that ignored an earlier pending order; an unmarked link in the membership notice).
- Tests: 805 end-to-end checks and 148 unit tests pass.
- Pending: E-1 applicant privacy text, confidentiality agreement and content rights assignment (counsel); E-2 the period during which an item writer may not train in the same domain; E-3 CV file upload (not built; CVs are requested by email after shortlisting until file storage for applicants is approved).
- October 25, 2026: **Digital badges (Open Badges 3.0, hosted by LIV)** (owner decision). Every valid credential and every active membership has a badge as JSON (`/badges/credentials/<number>.json?t=<QR token>`, `/badges/memberships/<number>.json?t=<token>`) and as a signed VC-JWT (same path with `.jwt`). Signature: Ed25519 (EdDSA); the public key is at `/badges/jwks.json` and the issuer profile at `/badges/issuer.json` (states what LIV does; no accreditation claim and no unprompted denial, owner instruction of October 25, 2026). The key comes from `BADGE_SIGNING_KEY` or, if unset, is derived from `CERT_HMAC_SECRET`. The recipient is a salted hash of the email (never the address); a membership badge carries the name only if the member chose to show it. A completion badge has no end date and says "completion of training only; not a professional qualification"; a membership badge says "membership only" and carries its end date. A badge needs the QR token (like the PDF); a revoked credential, an ended membership or a preview record has none (410 or 404). Links on the verification page (with the QR token), on Account > Credentials and on Account > Membership.
- Tests: 813 end-to-end checks and 154 unit tests pass.
- Pending: B-1 a dedicated `BADGE_SIGNING_KEY` in Replit Secrets before launch (so that rotating `CERT_HMAC_SECRET` never changes the badge key); B-2 badge image (waits for the parked design decision; badges work without one); B-3 listing with an external wallet or platform (Credly, Accredible) later if volume justifies it.
- October 25, 2026: **Governance and impartiality drafts** (owner decision). New draft `docs/legal/governance-structure.md` (who reviews and who decides in each area, the four staff positions, planned scheme committee and impartiality and appeals panel, records). The existing `impartiality-statement.md` gains §5a (experts, trainers and assessment: conflict declarations, item writers do not train in the same domain, trainers never mark their own learners, access to assessment material granted by name and logged). Both stay unpublished in Admin > Legal documents until their placeholders (named roles, panel members, separation period) are filled and the main account approves them.
- Tests: 814 end-to-end checks and 154 unit tests pass.
- October 25, 2026: the verification portal (/verify) links the provider, membership and digital badge checks. Tests: 815 end-to-end checks and 154 unit tests pass.
- October 26, 2026: owner approved the benchmark recommendations (see docs/BENCHMARK-PECB-ar.md §12.1). Home shows the message line "Verified learning you can trust." beside the brand line; the impartiality statement now states the two-year separation for item writers. Tests: 816 end-to-end checks and 154 unit tests pass.
- October 26, 2026: **Training quote requests** (owner decision). Public form /partners/request-quote; each request goes at once to up to five Authorized Training Providers with the scope (requested city first when any match), those with the fewest requests in 90 days first, ties at random; level gives no priority. Providers see requests at Portal > Training requests (Account Manager); staff at Admin > Training requests. English only; explicit consent text kept with the request. Tests: 820 end-to-end checks and 154 unit tests pass.
- October 26, 2026: **Illustrations** (owner decision: simple illustrations now, real photography later, no stock photos). Two line illustrations in the brand colors with text alternatives: the record flow (provider delivers, LIV issues, anyone checks) on the home page and the partner journey, and the individual account (credentials, digital badges, optional membership) on /individuals. Credential and certificate design stays parked. Tests: 821 end-to-end checks and 154 unit tests pass.
