# Session handoff (October 18, 2026)

Read this first in a new session, then only the sections of other docs that the task needs.

## Where things stand
- Branch: `claude/blissful-sagan-wp14xp`. Live app: Replit "US LIV" (https://us-project.replit.app); the owner pulls and republishes.
- Partner gateway (docs/PARTNER-AUTHORIZATION.md): batches A, B, C, D done (see the progress line in docs/BUILD-PLAN.md, partner gateway section).
- Next: Batch E (admin review and decision). It needs owner decisions P-2 (assessor and decision-maker, two different people), P-4 (2FA for partner admins; recommended yes), P-5 (trainer thresholds, or leave pending with a recorded assessor finding).
- Then F (applicant portal), G (public program page; P-6 fees), H (monitoring and renewal; P-11, P-12, P-13), I (partner roles).
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
