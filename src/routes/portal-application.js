// Applicant portal for the authorization application (Batch F). A partner reaches only its own application: every call
// goes through the Batch D library with the caller's platform id; a foreign or missing id both return 404.
const express = require('express');
const multer = require('multer');
const { q } = require('../db');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const X = require('../lib/activation');
const F = require('../lib/application-form');

const r = express.Router();
r.use(requirePlatformAdmin);
const csrfCheck = (req, res, next) => req.app.locals.csrfCheck(req, res, next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: A.MAX_EVIDENCE_BYTES, files: 1 } });
const UUID_RE = /^[0-9a-f-]{36}$/i;
const pid = (req) => req.user.platform_id;

// LIV staff acting for a partner do not apply on its behalf.
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot apply on behalf of a provider.' }) : next()));

const STATE_TEXT = {
  draft: ['Draft', 'Complete the form, upload your documents and submit when ready.'],
  submitted: ['Received', 'LIV has received the application.'],
  completeness_check: ['Completeness check', 'LIV is checking that the application and documents are complete.'],
  info_requested: ['Information requested', 'LIV needs more from you. Read the request below, update the form or documents and submit again.'],
  technical_review: ['Under review', 'LIV is reviewing the application against the authorization criteria.'],
  corrective_action: ['Corrections needed', 'Some points need correcting. Read the request below, update and submit again.'],
  awaiting_decision: ['Awaiting decision', 'The review is complete and the decision is being made.'],
  accepted_pending_activation: ['Accepted, pending activation', 'Accepted. Activation is a separate step: complete the items below.'],
  activated: ['Activated', 'Your organization is an active LIV Authorized Training Provider.'],
  declined: ['Declined', 'The application was declined. You may apply again.'],
  withdrawn: ['Withdrawn', 'You withdrew this application.'],
  closed: ['Closed', 'This application is closed.'],
};
// Only messages meant for the applicant are shown; the reviewer's internal notes are not.
const SHOW_REASON = ['info_requested', 'corrective_action', 'declined', 'accepted_pending_activation'];

async function evidenceCriteria(appId) {
  const { rows } = await q('SELECT DISTINCT criterion FROM partner_application_evidence WHERE application_id = $1', [appId]);
  return rows.map((e) => e.criterion);
}

async function renderApp(req, res, app, { errors = [], form = null, status = 200 } = {}) {
  const editable = A.APPLICANT_HOLDS.includes(app.state);
  const stored = form || (editable ? app.draft : (app.versions.length ? app.versions[app.versions.length - 1].form : app.draft)) || {};
  const criteria = await evidenceCriteria(app.id);
  const { rows: conditions } = await q(`SELECT k.id, k.text, k.blocking, k.due_date, (c.condition_id IS NOT NULL) AS closed FROM partner_application_conditions k
    JOIN partner_application_decisions d ON d.id = k.decision_id LEFT JOIN partner_condition_closures c ON c.condition_id = k.id WHERE d.application_id = $1`, [app.id]);
  const checklist = ['accepted_pending_activation', 'activated'].includes(app.state)
    ? (await X.getChecklist(app.id)).items.map((i) => ({ label: i.label, ok: i.ok, detail: i.key === 'test_issuance' ? '' : i.detail })) : [];
  res.status(status).render('portal/application', {
    title: 'Authorization application', app, editable, form: stored, errors, STATE_TEXT, FIELDS: F.FIELDS, CRITERIA_TITLES: F.CRITERIA_TITLES,
    missing: editable ? F.readiness(F.clean(stored), criteria) : [], conditions, checklist, SHOW_REASON, MAX_MB: Math.round(A.MAX_EVIDENCE_BYTES / 1048576),
  });
}

async function load(req, res, next) {
  if (!UUID_RE.test(req.params.id)) return next();
  try { return await A.getOwn(req.params.id, pid(req)); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}
const act = (fn) => wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  try { flash(req, 'success', await fn(req, app)); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/application/${app.id}`);
});

r.get('/', wrap(async (req, res) => {
  const { rows: [latest] } = await q(`SELECT id FROM partner_applications WHERE platform_id = $1 ORDER BY (state NOT IN ('activated','declined','withdrawn','closed')) DESC, created_at DESC LIMIT 1`, [pid(req)]);
  if (latest) return res.redirect(`/portal/application/${latest.id}`);
  res.render('portal/application-start', { title: 'Authorization application' });
}));

r.post('/start', wrap(async (req, res) => {
  try { const app = await A.createDraft(pid(req), req.user); return res.redirect(`/portal/application/${app.id}`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect('/portal/application'); }
}));

r.get('/:id', wrap(async (req, res, next) => { const app = await load(req, res, next); if (app) await renderApp(req, res, app); }));

r.post('/:id/save', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  const form = F.clean(req.body);
  const errors = F.validate(form);
  if (errors.length) return renderApp(req, res, app, { errors, form, status: 422 });
  try { await A.saveDraft(app.id, pid(req), req.user, form); flash(req, 'success', 'Draft saved.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/application/${app.id}`);
}));

r.post('/:id/evidence', upload.single('file'), csrfCheck, act(async (req, app) => {
  if (!req.file) throw new A.ApplicationError('Choose a file to upload.');
  await A.addEvidence(app.id, pid(req), req.user, { criterion: String(req.body.criterion || ''), filename: req.file.originalname, buffer: req.file.buffer });
  return 'Document uploaded.';
}));
r.post('/:id/evidence/:eid/remove', act(async (req, app) => {
  if (!UUID_RE.test(req.params.eid)) throw new A.ApplicationError('Document not found.', 404);
  await A.removeDraftEvidence(app.id, pid(req), req.user, req.params.eid);
  return 'Document removed.';
}));
r.get('/:id/evidence/:eid', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app || !UUID_RE.test(req.params.eid)) return next();
  try {
    const f = await A.readEvidence(req.params.eid, req.user, { platformId: pid(req) });
    res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content);
  } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));

r.post('/:id/submit', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  const form = F.clean(req.body);
  const errors = F.validate(form, { submit: true, evidence: await evidenceCriteria(app.id) });
  if (errors.length) return renderApp(req, res, app, { errors, form, status: 422 });
  try {
    await A.saveDraft(app.id, pid(req), req.user, form);
    const v = await A.submit(app.id, pid(req), req.user);
    flash(req, 'success', `Version ${v.version} submitted. You will be told here what LIV needs next.`);
  } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/application/${app.id}`);
}));

r.post('/:id/withdraw', act(async (req, app) => { await A.withdraw(app.id, pid(req), req.user, String(req.body.reason || 'Withdrawn by the applicant').slice(0, 500)); return 'The application was withdrawn.'; }));

module.exports = r;
