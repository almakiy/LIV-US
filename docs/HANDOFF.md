# Session handoff (October 20, 2026)

Read this first in a new session, then only the sections of other docs that the task needs.

## Where things stand
- Branch: `claude/kind-hamilton-n37bx4` (the owner confirmed October 20 that work and pushes go here). `claude/blissful-sagan-wp14xp` pointed at the same commit when this was written. Live app: Replit "US LIV" (https://us-project.replit.app); the owner pulls and republishes.
- Partner gateway (docs/PARTNER-AUTHORIZATION.md): batches A to I are built. See the progress line in docs/BUILD-PLAN.md, partner gateway section, and the status in docs/DECISIONS.md §7.
- Batch H (October 20): monitoring indicators and audit cases, renewals, material-change notices, sanctions screening records, standards versions, retention schedule, draft reminders at 30 and 90 days, and automated WCAG 2.2 AA checks.
- Platform currency is the US dollar (owner decision). Fee proposals are in docs/FEES-REVIEW.md, awaiting owner approval; nothing is applied (P-6). Partnership levels Bronze/Silver/Gold are in docs/PARTNER-LEVELS.md (P-15 to P-17).
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
- Unit: `npm run test:unit` (124 checks).
- End to end: needs local PostgreSQL (`service postgresql start`), a fresh database, `npm run migrate && npm run seed`, the server on port 3000, then `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/e2e.js http://localhost:3000`. Kill any leftover server process first with `fuser -k 3000/tcp`. Run it once at the end of each batch.
- Accessibility: the end-to-end suite runs axe-core (WCAG 2.2 AA tags) on the batch pages and the main public, admin and provider pages. Other pages are not yet covered by the automated check.

## Owner decisions
Answered October 20, 2026:
- Standards transition (P-9): a new version applies to later applications only. Built.
- Renewal lapse: does not change the provider status automatically; staff are alerted through the work queue. Built.
- City, training domain and delivery method: optional fields the provider fills in its profile, shown in the directory as information the provider states. Nothing is inferred. Built.
- Public verification by ATP number: returns status, active scope and level only. Built at /api/v1/providers/:number and /partners/verify.
- Reference images: the owner will place them in docs/references/ personally.
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
- Turning on `PUBLIC_APPLY` and `PUBLIC_FEES`.
- Before launch: delete `ADMIN_RESET_PASSWORD` and turn on two-step sign-in for the admin account.
