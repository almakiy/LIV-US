# Session handoff (October 18, 2026)

Read this first in a new session, then only the sections of other docs that the task needs.

## Where things stand
- Branch: `claude/blissful-sagan-wp14xp`. Live app: Replit "US LIV" (https://us-project.replit.app); the owner pulls and republishes.
- Partner gateway (docs/PARTNER-AUTHORIZATION.md): batches A, B, C, D done (see the progress line in docs/BUILD-PLAN.md, partner gateway section).
- Batch E done (review, assessment, recommendation, separated decision, staff positions, trainer records, activation checklist and activation, reversal). Owner decisions: P-2 answered with positions (vacant accounts until people are appointed in Admin > Staff positions), P-4 yes, P-5 pending until thresholds suit the stage. Batch F (applicant portal) and F2a (staged application, fee at submission, review held until paid) done October 19. Email foundation 2.1 done (needs an SMTP provider and domain records from the owner to send). Title requests (F2) done. Next: scope expansion requests, trainer additions, then G (public page and register), H (monitoring, levels, audits), I (partner roles).
- Platform currency is the US dollar (owner decision). Fee proposals, planned prices for later credentials and the provider-level evaluation are drafted in docs/FEES-REVIEW.md, awaiting owner approval; nothing is applied (P-6). Partnership levels Bronze/Silver/Gold are decided in principle; criteria and durations are drafted in docs/PARTNER-LEVELS.md (P-15 to P-17).
- Certificate design is parked by the owner (October 19): templates by level, seals and emblems, attendance certificates, custom design pricing. See docs/PARTNER-LEVELS.md §12. Do not start any of it.
- Then F2 (title requests, scope expansion), G (public program page; P-6 fees), H (monitoring and renewal; P-11, P-12, P-13), I (partner roles).
- Only the Training Completion Credential is live. Assessed qualification and professional certification are not enabled.

## Working rules
- The owner writes in Arabic; reply in Arabic, short, numbered, step by step with a check after each step.
- One batch at a time, only after the owner approves its scope. Tests after each change; push only when green.
- Never invent names, fees, thresholds, accreditations or regulatory claims; leave them as pending decisions.
- No ISO/IEC 17024 conformity claim. Historical credential PDFs are never changed. Issuance stays with LIV.
- Keep ADMIN_RESET_PASSWORD in Replit Secrets until the site is finished; before launch, remind the owner to delete it and turn on admin 2FA.

## Tests
- Unit: `npm run test:unit`.
- End to end: needs local PostgreSQL (`service postgresql start`), a fresh database, `npm run migrate && npm run seed`, the server on port 3000, then `node tests/e2e.js http://localhost:3000`. Kill any leftover server process first.
