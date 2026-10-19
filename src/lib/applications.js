// Partner applications (docs/PARTNER-AUTHORIZATION.md §4, §11; Batch D): states, locked versions, private evidence.
// Every rule here is enforced on the server; screens (Batches E and F) only call these functions.
// Tenant isolation: every applicant-side call takes the caller's platform id and never reads another partner's rows.
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const files = require('./files');

class ApplicationError extends Error { constructor(msg, status = 422) { super(msg); this.status = status; } }

const FINAL = ['activated', 'declined', 'withdrawn', 'closed'];
// Who may move an application from one state to another. 'system' moves happen inside submit().
const TRANSITIONS = {
  draft: { submitted: 'applicant' },
  submitted: { completeness_check: 'system' },
  completeness_check: { info_requested: 'staff', technical_review: 'staff' },
  info_requested: { completeness_check: 'applicant' },
  technical_review: { corrective_action: 'staff', awaiting_decision: 'staff' },
  corrective_action: { technical_review: 'applicant' },
  awaiting_decision: { accepted_pending_activation: 'staff', declined: 'staff' },
  accepted_pending_activation: {},
};
// The applicant edits the draft only while the application is with them.
const APPLICANT_HOLDS = ['draft', 'info_requested', 'corrective_action'];

/** Returns who may make the move ('applicant' | 'staff' | 'system'), or null if the move is not allowed. */
function allowedBy(from, to) {
  if (FINAL.includes(from)) return null;
  if (to === 'withdrawn') return 'applicant';
  if (to === 'closed') return 'staff';
  return (TRANSITIONS[from] || {})[to] || null;
}

// Evidence files: PDF, PNG or JPEG only, recognized by their content, not their name.
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
function sniff(buf) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  return null;
}

async function event(c, app, to, user, reason, version) {
  await c.query(`INSERT INTO partner_application_events (application_id, from_state, to_state, version, actor_user_id, actor_label, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [app.id, app.state, to, version ?? app.current_version, user?.id || null, user?.email || 'system', reason || '']);
  await c.query('UPDATE partner_applications SET state = $2::varchar, updated_at = now(), closed_at = CASE WHEN $2::varchar = ANY($3::varchar[]) THEN now() ELSE closed_at END WHERE id = $1', [app.id, to, FINAL]);
  await audit({ user, platformId: app.platform_id, action: `application.${to}`, target: app.id, metadata: { from: app.state, version: version ?? app.current_version } }, c);
  app.state = to;
}

// Applicant-side read: only the caller's own partner record. A missing or foreign id looks the same (404).
async function lockOwn(c, appId, platformId) {
  const { rows: [app] } = await c.query('SELECT * FROM partner_applications WHERE id = $1 AND platform_id = $2 FOR UPDATE', [appId, platformId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  return app;
}

async function currentCriteriaVersion(c) {
  const { rows: [v] } = await c.query(`SELECT version FROM partner_criteria_sets WHERE status IN ('in_force','draft')
    ORDER BY (status = 'in_force') DESC, created_at DESC LIMIT 1`);
  if (!v) throw new ApplicationError('No authorization criteria are recorded.', 500);
  return v.version;
}

async function createDraft(platformId, user) {
  return tx(async (c) => {
    const { rows: [open] } = await c.query(`SELECT id FROM partner_applications WHERE platform_id = $1 AND NOT (state = ANY($2))`, [platformId, FINAL]);
    if (open) throw new ApplicationError('This partner already has an open application.', 409);
    const { rows: [app] } = await c.query(`INSERT INTO partner_applications (platform_id, criteria_version, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [platformId, await currentCriteriaVersion(c), user?.id || null]);
    await c.query(`INSERT INTO partner_application_events (application_id, to_state, version, actor_user_id, actor_label) VALUES ($1,'draft',0,$2,$3)`, [app.id, user?.id || null, user?.email || 'system']);
    await audit({ user, platformId, action: 'application.create', target: app.id }, c);
    return app;
  });
}

async function saveDraft(appId, platformId, user, form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) throw new ApplicationError('Form data must be an object.');
  return tx(async (c) => {
    const app = await lockOwn(c, appId, platformId);
    if (!APPLICANT_HOLDS.includes(app.state)) throw new ApplicationError(`The application cannot be edited while it is ${app.state}.`, 409);
    await c.query('UPDATE partner_applications SET draft = $2, updated_at = now() WHERE id = $1', [app.id, JSON.stringify(form)]);
    return { ...app, draft: form };
  });
}

async function addEvidence(appId, platformId, user, { criterion, filename, buffer, supersedesId }) {
  if (!/^C[1-9]$/.test(String(criterion))) throw new ApplicationError('Evidence must be linked to a criterion (C1 to C9).');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ApplicationError('The file is empty.');
  if (buffer.length > MAX_EVIDENCE_BYTES) throw new ApplicationError('Evidence files can be up to 10 MB.');
  const kind = sniff(buffer);
  if (!kind) throw new ApplicationError('Evidence must be a PDF, PNG or JPEG file.');
  const name = String(filename || `evidence.${kind.ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 200);
  return tx(async (c) => {
    const app = await lockOwn(c, appId, platformId);
    if (!APPLICANT_HOLDS.includes(app.state)) throw new ApplicationError(`Evidence cannot be added while the application is ${app.state}.`, 409);
    if (supersedesId) {
      const { rows: [old] } = await c.query('SELECT id FROM partner_application_evidence WHERE id = $1 AND application_id = $2', [supersedesId, app.id]);
      if (!old) throw new ApplicationError('The evidence being replaced is not part of this application.');
    }
    const id = crypto.randomUUID();
    const key = `evidence/${app.id}/${id}.${kind.ext}`;
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    await files.putFile(key, buffer, c);
    const { rows: [ev] } = await c.query(`INSERT INTO partner_application_evidence (id, application_id, criterion, file_key, filename, content_type, bytes, sha256, supersedes_id, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, criterion, filename, bytes, sha256, version`, [id, app.id, criterion, key, name, kind.type, buffer.length, sha, supersedesId || null, user?.id || null]);
    await audit({ user, platformId, action: 'application.evidence.add', target: app.id, metadata: { evidence: id, criterion } }, c);
    return ev;
  });
}

/** Removes evidence that is still in the draft. Submitted evidence is locked (database trigger as well). */
async function removeDraftEvidence(appId, platformId, user, evidenceId) {
  return tx(async (c) => {
    const app = await lockOwn(c, appId, platformId);
    const { rowCount } = await c.query('DELETE FROM partner_application_evidence WHERE id = $1 AND application_id = $2 AND version IS NULL', [evidenceId, app.id]);
    if (!rowCount) throw new ApplicationError('Only evidence that has not been submitted can be removed.', 409);
    await audit({ user, platformId, action: 'application.evidence.remove', target: app.id, metadata: { evidence: evidenceId } }, c);
  });
}

/** Locks the draft and its new evidence as the next numbered version. */
async function submit(appId, platformId, user) {
  return tx(async (c) => {
    const app = await lockOwn(c, appId, platformId);
    const to = { draft: 'submitted', info_requested: 'completeness_check', corrective_action: 'technical_review' }[app.state];
    if (!to) throw new ApplicationError(`The application cannot be submitted while it is ${app.state}.`, 409);
    const version = app.current_version + 1;
    await c.query(`INSERT INTO partner_application_versions (application_id, version, form, criteria_version, submitted_by) VALUES ($1,$2,$3,$4,$5)`,
      [app.id, version, JSON.stringify(app.draft), app.criteria_version, user?.id || null]);
    await c.query('UPDATE partner_application_evidence SET version = $2 WHERE application_id = $1 AND version IS NULL', [app.id, version]);
    await c.query('UPDATE partner_applications SET current_version = $2 WHERE id = $1', [app.id, version]);
    await event(c, app, to, user, `Version ${version} submitted`, version);
    if (to === 'submitted') await event(c, app, 'completeness_check', null, 'Received for completeness check', version);
    return { id: app.id, state: app.state, version };
  });
}

async function withdraw(appId, platformId, user, reason) {
  return tx(async (c) => {
    const app = await lockOwn(c, appId, platformId);
    if (!allowedBy(app.state, 'withdrawn')) throw new ApplicationError(`The application cannot be withdrawn while it is ${app.state}.`, 409);
    await event(c, app, 'withdrawn', user, reason);
    return { id: app.id, state: app.state };
  });
}

/** LIV staff move (screens and role checks come in Batch E; callers must pass a staff user). */
async function staffTransition(appId, user, to, reason) {
  await require('./positions').require(user, 'assess');
  if (!String(reason || '').trim()) throw new ApplicationError('A reason is required.');
  return tx(async (c) => {
    const { rows: [app] } = await c.query('SELECT * FROM partner_applications WHERE id = $1 FOR UPDATE', [appId]);
    if (!app) throw new ApplicationError('Application not found.', 404);
    if (allowedBy(app.state, to) !== 'staff') throw new ApplicationError(`LIV staff cannot move an application from ${app.state} to ${to}.`, 409);
    // The decision itself is recorded by assessment.decide(), by a different person from the assessor; never as a plain move.
    if (app.state === 'awaiting_decision') throw new ApplicationError('Record the decision on the decision form.', 409);
    if (to === 'technical_review' && app.state === 'completeness_check') {
      // Review past the completeness check starts when the application fee is received. The fee pays for the work; it never affects the decision.
      const { rows: [inv] } = await c.query('SELECT status FROM invoices WHERE id = $1', [app.fee_invoice_id]);
      if (!inv || inv.status !== 'paid') throw new ApplicationError('The application fee has not been received yet, so the review cannot start.', 409);
    }
    if (to === 'awaiting_decision') {
      const blocked = await require('./assessment').readyForDecision(c, app);
      if (blocked) throw new ApplicationError(blocked, 409);
    }
    await event(c, app, to, user, reason);
    return { id: app.id, state: app.state, platformId: app.platform_id, reason: String(reason).trim() };
  }).then(async (r) => {
    // A request for information or a correction goes to the applicant by email. The reason is written for the applicant.
    if (['info_requested', 'corrective_action'].includes(to)) {
      const { rows: [pl] } = await q('SELECT company_name FROM platforms WHERE id = $1', [r.platformId]);
      await require('./email').queueToPlatform(r.platformId, 'application_request', { company: pl?.company_name, reason: r.reason }, `request:${r.id}:${Date.now()}`);
    }
    return { id: r.id, state: r.state };
  });
}

/** Called when an invoice becomes paid: if it is an application fee, the applicant is told. */
async function onInvoicePaid(invoiceId) {
  const { rows: [a] } = await q('SELECT a.id, a.platform_id, p.company_name FROM partner_applications a JOIN platforms p ON p.id = a.platform_id WHERE a.fee_invoice_id = $1', [invoiceId]);
  if (a) await require('./email').queueToPlatform(a.platform_id, 'application_fee_received', { company: a.company_name }, `fee:${invoiceId}`);
}

/** Applicant view: the application, its versions, evidence list (no file bytes) and history. */
async function getOwn(appId, platformId) {
  const { rows: [app] } = await q('SELECT * FROM partner_applications WHERE id = $1 AND platform_id = $2', [appId, platformId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  const [versions, evidence, events] = await Promise.all([
    q('SELECT version, form, criteria_version, submitted_at FROM partner_application_versions WHERE application_id = $1 ORDER BY version', [app.id]),
    q('SELECT id, version, criterion, filename, content_type, bytes, sha256, supersedes_id, created_at FROM partner_application_evidence WHERE application_id = $1 ORDER BY created_at', [app.id]),
    q('SELECT from_state, to_state, version, actor_label, reason, created_at FROM partner_application_events WHERE application_id = $1 ORDER BY created_at, id', [app.id]),
  ]);
  return { ...app, versions: versions.rows, evidence: evidence.rows, events: events.rows };
}

/**
 * Reads an evidence file for the applicant's own users (pass platformId) or LIV staff (pass staff: true).
 * Every read is logged. A foreign id returns 404, the same as a missing one.
 */
async function readEvidence(evidenceId, user, { platformId, staff = false } = {}) {
  if (!staff && !platformId) throw new ApplicationError('Evidence not found.', 404);
  if (staff && user?.role !== 'super_admin') throw new ApplicationError('Evidence not found.', 404);
  const { rows: [ev] } = await q(`SELECT e.*, a.platform_id FROM partner_application_evidence e JOIN partner_applications a ON a.id = e.application_id
    WHERE e.id = $1 AND ($2::uuid IS NULL OR a.platform_id = $2)`, [evidenceId, staff ? null : platformId]);
  if (!ev) throw new ApplicationError('Evidence not found.', 404);
  const f = await files.getFile(ev.file_key);
  if (!f) throw new ApplicationError('The evidence file is missing from storage.', 500);
  await audit({ user, platformId: ev.platform_id, action: 'application.evidence.download', target: ev.application_id, metadata: { evidence: ev.id } });
  return { content: f.content, type: ev.content_type, filename: ev.filename };
}


/** Closes drafts that have seen no activity for the given days (default 180), after notice by email once that exists. Returns the count. */
async function closeStaleDrafts(days = 180) {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT * FROM partner_applications WHERE state = 'draft' AND current_version = 0 AND updated_at < now() - ($1::int * interval '1 day') FOR UPDATE`, [days]);
    for (const app of rows) await event(c, app, 'closed', null, `Closed after ${days} days without activity`);
    return rows.length;
  });
}

module.exports = {
  ApplicationError, TRANSITIONS, FINAL, APPLICANT_HOLDS, MAX_EVIDENCE_BYTES, allowedBy, sniff,
  event, closeStaleDrafts, onInvoicePaid, createDraft, saveDraft, addEvidence, removeDraftEvidence, submit, withdraw, staffTransition, getOwn, readEvidence,
};
