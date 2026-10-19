// Applicant portal for the authorization application (Batches F and F2). The application is filled in short stages; each
// stage saves on its own and only submission checks completeness. A partner reaches only its own application: every call
// goes through the Batch D library with the caller's platform id; a foreign or missing id both return 404.
const express = require('express');
const multer = require('multer');
const { q } = require('../db');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const X = require('../lib/activation');
const F = require('../lib/application-form');
const store = require('../lib/billing-store');

const r = express.Router();
r.use(requirePlatformAdmin);
const csrfCheck = (req, res, next) => req.app.locals.csrfCheck(req, res, next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: A.MAX_EVIDENCE_BYTES, files: 1 } });
const UUID_RE = /^[0-9a-f-]{36}$/i;
const pid = (req) => req.user.platform_id;
const FEE_CODE = 'ACC_APPLICATION'; // the application fee in the price catalog; every provider starts at the Bronze (Starter) plan

// LIV staff acting for a partner do not apply on its behalf.
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot apply on behalf of a provider.' }) : next()));

const STATE_TEXT = {
  draft: ['Draft', 'Complete the stages, upload your documents and submit when ready. You can leave and come back at any time.'],
  submitted: ['Received', 'LIV has received the application.'],
  completeness_check: ['Completeness check', 'LIV is checking that the application and documents are complete. Review continues once the application fee is received.'],
  info_requested: ['Information requested', 'LIV needs more from you. Read the request below, update the stages or documents and submit again.'],
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
async function feeInfo(app) {
  const { rows: [price] } = await q(`SELECT pr.unit_amount_cents FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id
    WHERE p.code = $1 AND p.active AND pr.plan = 'starter' AND (pr.valid_to IS NULL OR pr.valid_to >= CURRENT_DATE) ORDER BY pr.min_qty LIMIT 1`, [FEE_CODE]);
  let invoice = null;
  if (app.fee_invoice_id) ({ rows: [invoice] } = await q('SELECT id, number, status, total_cents, amount_paid_cents FROM invoices WHERE id = $1', [app.fee_invoice_id]));
  return { amount: price ? Number(price.unit_amount_cents) : null, invoice };
}
const stageIndex = (k) => Math.max(0, F.STAGES.findIndex((s) => s.key === k));

async function renderApp(req, res, app, { errors = [], form = null, status = 200, step = null } = {}) {
  const editable = A.APPLICANT_HOLDS.includes(app.state);
  const current = F.STAGES.some((s) => s.key === (step || req.query.step)) ? (step || req.query.step) : 'org';
  let stored = form || (editable ? app.draft : (app.versions.length ? app.versions[app.versions.length - 1].form : app.draft)) || {};
  if (editable && !form) {
    // Stage 1 data is not asked for again: empty fields start from the sign-up details (kept only once the stage is saved).
    const { rows: [pl] } = await q('SELECT company_name, country, website, contact_email FROM platforms WHERE id = $1', [pid(req)]);
    const pre = { legal_name: pl.company_name, country: pl.country || '', website: pl.website || '', representative_name: req.user.full_name || '', representative_email: req.user.email };
    stored = { ...Object.fromEntries(Object.entries(pre).filter(([k]) => !stored[k])), ...stored };
  }
  const criteria = await evidenceCriteria(app.id);
  const done = F.stageStatus(F.clean(editable ? app.draft : stored), criteria);
  const { rows: conditions } = await q(`SELECT k.id, k.text, k.blocking, k.due_date, (c.condition_id IS NOT NULL) AS closed FROM partner_application_conditions k
    JOIN partner_application_decisions d ON d.id = k.decision_id LEFT JOIN partner_condition_closures c ON c.condition_id = k.id WHERE d.application_id = $1`, [app.id]);
  const checklist = ['accepted_pending_activation', 'activated'].includes(app.state)
    ? (await X.getChecklist(app.id)).items.map((i) => ({ label: i.label, ok: i.ok, detail: i.key === 'test_issuance' ? '' : i.detail })) : [];
  res.status(status).render('portal/application', {
    title: 'Authorization application', app, editable, form: stored, errors, STATE_TEXT, FIELDS: F.FIELDS, STAGES: F.STAGES, step: current, done,
    CRITERIA_TITLES: F.CRITERIA_TITLES, missing: editable ? F.readiness(F.clean(app.draft), criteria) : [], conditions, checklist, SHOW_REASON,
    money: require('../lib/billing').money, MAX_MB: Math.round(A.MAX_EVIDENCE_BYTES / 1048576), fee: await feeInfo(app), next: F.STAGES[Math.min(F.STAGES.length - 1, stageIndex(current) + 1)].key,
  });
}

async function load(req, res, next) {
  if (!UUID_RE.test(req.params.id)) return next();
  try { return await A.getOwn(req.params.id, pid(req)); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}
const act = (fn, step) => wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  try { flash(req, 'success', await fn(req, app)); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/application/${app.id}${step ? '?step=' + step : ''}`);
});

r.get('/', wrap(async (req, res) => {
  const { rows: [latest] } = await q(`SELECT id FROM partner_applications WHERE platform_id = $1 ORDER BY (state NOT IN ('activated','declined','withdrawn','closed')) DESC, created_at DESC LIMIT 1`, [pid(req)]);
  if (latest) return res.redirect(`/portal/application/${latest.id}`);
  res.render('portal/application-start', { title: 'Authorization application', stages: F.STAGES });
}));

r.post('/start', wrap(async (req, res) => {
  try { const app = await A.createDraft(pid(req), req.user); return res.redirect(`/portal/application/${app.id}`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect('/portal/application'); }
}));

r.get('/:id', wrap(async (req, res, next) => { const app = await load(req, res, next); if (app) await renderApp(req, res, app); }));

// Saves one stage. Only that stage's fields are checked (language and format); the rest of the draft is kept as it is.
r.post('/:id/save', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  const stage = F.STAGES.find((s) => s.key === req.body.step) || F.STAGES[0];
  const part = F.clean(req.body, stage.fields);
  const errors = F.validate(part, { only: stage.fields });
  if (errors.length) return renderApp(req, res, app, { errors, form: { ...app.draft, ...part }, status: 422, step: stage.key });
  try { await A.saveDraft(app.id, pid(req), req.user, { ...app.draft, ...part }); flash(req, 'success', `${stage.title} saved.`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect(`/portal/application/${app.id}?step=${stage.key}`); }
  const go = req.body.go === 'next' ? F.STAGES[Math.min(F.STAGES.length - 1, stageIndex(stage.key) + 1)].key : stage.key;
  res.redirect(`/portal/application/${app.id}?step=${go}`);
}));

r.post('/:id/evidence', upload.single('file'), csrfCheck, act(async (req, app) => {
  if (!req.file) throw new A.ApplicationError('Choose a file to upload.');
  await A.addEvidence(app.id, pid(req), req.user, { criterion: String(req.body.criterion || ''), filename: req.file.originalname, buffer: req.file.buffer });
  return 'Document uploaded.';
}, 'documents'));
r.post('/:id/evidence/:eid/remove', act(async (req, app) => {
  if (!UUID_RE.test(req.params.eid)) throw new A.ApplicationError('Document not found.', 404);
  await A.removeDraftEvidence(app.id, pid(req), req.user, req.params.eid);
  return 'Document removed.';
}, 'documents'));
r.get('/:id/evidence/:eid', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app || !UUID_RE.test(req.params.eid)) return next();
  try {
    const f = await A.readEvidence(req.params.eid, req.user, { platformId: pid(req) });
    res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content);
  } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));

// Submission uses the saved draft. The first submission also issues the application fee invoice; a later one (after LIV asks for more) does not.
r.post('/:id/submit', wrap(async (req, res, next) => {
  const app = await load(req, res, next); if (!app) return;
  const back = (m) => { flash(req, 'error', m); return res.redirect(`/portal/application/${app.id}?step=review`); };
  const errors = F.validate(F.clean(app.draft), { submit: true, evidence: await evidenceCriteria(app.id) });
  if (errors.length) return renderApp(req, res, app, { errors, form: app.draft, status: 422, step: 'review' });
  const first = app.current_version === 0 && !app.fee_invoice_id;
  let draftInvoice = null;
  if (first) {
    try {
      const { rows: [platform] } = await q('SELECT * FROM platforms WHERE id = $1', [pid(req)]);
      draftInvoice = await store.createDraft({ ...platform, plan: 'starter' }, { items: [{ code: FEE_CODE, qty: 1 }], notes: `Application fee for ${platform.company_name}`, createdBy: req.user.id });
    } catch (e) { return back('The application fee is not set up yet, so the application cannot be submitted. LIV has been notified.'); }
  }
  let v;
  try { v = await A.submit(app.id, pid(req), req.user); }
  catch (e) {
    if (draftInvoice) await store.discardInvoice(draftInvoice).catch(() => {});
    if (!(e instanceof A.ApplicationError)) throw e;
    return back(e.message);
  }
  const { rows: [pl] } = await q('SELECT company_name FROM platforms WHERE id = $1', [pid(req)]);
  await require('../lib/email').queueToPlatform(pid(req), 'application_submitted', { company: pl.company_name, version: v.version, feeDue: first }, `submitted:${app.id}:${v.version}`);
  if (first) {
    await store.issueInvoice(draftInvoice, { dueDays: 14 });
    await q('UPDATE partner_applications SET fee_invoice_id = $2 WHERE id = $1', [app.id, draftInvoice]);
    flash(req, 'success', `Version ${v.version} submitted. Pay the application fee below so LIV can start the review.`);
    return res.redirect(`/portal/billing/invoices/${draftInvoice}`);
  }
  flash(req, 'success', `Version ${v.version} submitted. You will be told here what LIV needs next.`);
  res.redirect(`/portal/application/${app.id}`);
}));

r.post('/:id/withdraw', act(async (req, app) => { await A.withdraw(app.id, pid(req), req.user, String(req.body.reason || 'Withdrawn by the applicant').slice(0, 500)); return 'The application was withdrawn.'; }));

module.exports = r;
