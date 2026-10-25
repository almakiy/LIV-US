# Session handoff (October 20, 2026)

Read this first in a new session, then only the sections of other docs that the task needs.

## Where things stand
- Branch: `claude/blissful-sagan-wp14xp`. This is the approved branch, because Replit is connected to it. Work is developed on `claude/kind-hamilton-n37bx4` and then fast-forwarded into `claude/blissful-sagan-wp14xp`. Live app: Replit "US LIV" (https://us-project.replit.app); the owner pulls and republishes.
- Replit runs on port 5000 with the schema `liv_github_preview`. The `.replit` file in the repository is the actual Replit configuration: do not replace it with another run file.
- Partner gateway (docs/PARTNER-AUTHORIZATION.md): batches A to I are built. See the progress line in docs/BUILD-PLAN.md, partner gateway section, and the status in docs/DECISIONS.md §7.
- Batch H (October 20): monitoring indicators and audit cases, renewals, material-change notices, sanctions screening records, standards versions, retention schedule, draft reminders at 30 and 90 days, and automated WCAG 2.2 AA checks.
- Platform currency is the US dollar (owner decision). Fee proposals are in docs/FEES-REVIEW.md, awaiting owner approval; nothing is applied (P-6). Partnership levels Bronze/Silver/Gold are in docs/PARTNER-LEVELS.md (P-15 to P-17).
- Individuals portal (docs/INDIVIDUALS-PORTAL.md, October 22): M1 built (individual accounts, safe credential claims, dashboard, support, privacy), behind `INDIVIDUAL_ACCOUNTS` (off). Admin > Preview accounts: preview training provider and preview individual for the main account, with automatic checks and a check log. M2 built (membership plans, payment, card, renewal, expiry) behind `MEMBERSHIP_SALES` (off). Preview test data is cleared at sign-out of the main account. M3 (resources, consents, newsletter, events, contributions), M4 (gifts, campaigns, group packs) and the ready parts of M5 (interest list; preparation closed until a program operates) are built behind `PRODUCT_SALES` and `NEWSLETTER_SENDING` (off). The owner's decisions are listed in docs/INDIVIDUALS-PORTAL.md.
- Certificate design is parked by the owner (October 19). Do not start any of it.
- Only the Training Completion Credential is live. Assessed qualification and professional certification are not enabled.
- `PUBLIC_APPLY` and `PUBLIC_FEES` are opened only on the owner's decision (see the final list).

## Working rules
- The owner writes in Arabic; reply in Arabic, short, numbered, step by step with a check after each step.
- One batch at a time. Tests after each change; push only when green. One commit per batch.
- Never invent names, fees, thresholds, accreditations or regulatory claims; leave them as pending decisions.
- No ISO/IEC 17024 conformity claim. Historical credential PDFs are never changed. Issuance stays with LIV.
- Keep ADMIN_RESET_PASSWORD in Replit Secrets until the site is finished; before launch, remind the owner to delete it and turn on admin 2FA.

## Tests
- Unit: `npm run test:unit` (127 checks).
- End to end: needs local PostgreSQL (`service postgresql start`), a fresh database, `npm run migrate && npm run seed`, the server on port 3000, then `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/e2e.js http://localhost:3000`. Kill any leftover server process first with `fuser -k 3000/tcp`. Run it once at the end of each batch.
- Accessibility: the end-to-end suite runs axe-core (WCAG 2.2 AA tags) on the batch pages and the main public, admin and provider pages. Other pages are not yet covered by the automated check.

## Owner decisions
Answered October 20, 2026:
- Standards transition (P-9): a new version applies to later applications only. Built.
- Renewal lapse: does not change the provider status automatically; staff are alerted through the work queue. Built.
- City, training domain and delivery method: optional fields the provider fills in its profile, shown in the directory as information the provider states. Nothing is inferred. Built.
- Public verification by ATP number: returns status, active scope and level only. Built at /api/v1/providers/:number and /partners/verify.
- Public details (about, website, professional links): provided by the provider and reviewed by LIV before they are published; the published version stays until approval. Built.
- Branches and sites: shown only after LIV approves them, and each branch covers only the scopes approved for it. Built.
- Scope details (number, domain, boundaries, restrictions, delivery methods, dates): recorded by LIV with a revision and audit trail. Built.
- Approved courses: shown under their scope, from the existing authorized course titles (no parallel catalogue). Built.
- Scope document (PDF) with a verification QR code, downloadable from the provider page. Official issuance waits for template approval (set AUTH_DOC_TEMPLATE_APPROVED=true then); until then it is marked as a draft for review. Built.
- Badge: the review model is in docs/previews/badge-review.html; the live site keeps the text badge until the official artwork is approved.
- Process page: built into the site at /partners/journey, linked from the program page. Built.
- Reference images: the owner places them in docs/references/; the folder holds a note of what is not attached.
- Interpretations of Batch H confirmed: a refused upload is one with no valid rows or refused by issuance; no alert for providers with no issuance history on the 5-times-average rule; 5 working days is the response date and 10 the escalation date.

Waiting (final list, collected for the end):
- Fee approval (P-6).
- Level thresholds (P-15), Gold commitments (P-17), badge licence conditions (P-16).
- Trainer thresholds (P-5).
- Agreement text from counsel (P-7).
- Renewal period (P-11). Dates are set by hand.
- Material-change categories and materiality (P-12). The six categories are placeholders.
- Records retention periods (P-14), with counsel.
- Wording of public claims (D-C).
- Email footer from counsel; SMTP provider and SPF, DKIM, DMARC records.
- Names for the four staff positions.
- First specialty and scope.
- List of allowed exception types.
- Error-handling policy for records (counsel).
- Reopening the certificate design (P-21 and P-22).
- Separate the preview and production environments (a separate schema or a separate database) before any real data is entered.
- Turning on `PUBLIC_APPLY` and `PUBLIC_FEES`.
- Before launch: delete `ADMIN_RESET_PASSWORD` and turn on two-step sign-in for the admin account.
