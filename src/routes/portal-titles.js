// Portal: title (course) requests (F2). A provider reaches only its own requests; a foreign or missing id both return 404.
const express = require('express');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const T = require('../lib/titles');
const F = require('../lib/title-form');

const r = express.Router();
r.use(requirePlatformAdmin);
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot request titles on behalf of a provider.' }) : next()));
const UUID_RE = /^[0-9a-f-]{36}$/i;
const pid = (req) => req.user.platform_id;
const LABEL = { draft: 'Draft', submitted: 'With LIV', awaiting_decision: 'With LIV', needs_changes: 'Needs changes', needs_wider_review: 'Needs a wider review', needs_scope_expansion: 'Needs a scope expansion', authorized: 'Authorized', refused: 'Refused', withdrawn: 'Withdrawn' };
const NEXT = {
  draft: 'Complete the form and submit it.', submitted: 'LIV is reviewing the request.', awaiting_decision: 'The review is done and the decision is being made.',
  needs_changes: 'Read the message below, update the form and submit again.', needs_wider_review: 'LIV needs more to review this title. Read the message below, update and submit again.',
  needs_scope_expansion: 'This title is outside your authorized field or delivery capability. It needs a scope expansion first; this request is closed for editing.',
  authorized: 'The title is part of your authorized scope.', refused: 'The request was refused. Read the reasons below.', withdrawn: 'You withdrew this request.',
};

async function load(req, res, next) {
  if (!UUID_RE.test(req.params.id)) return next();
  try { return await T.getOwn(req.params.id, pid(req)); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}
async function render(req, res, t, { errors = [], form = null, status = 200 } = {}) {
  res.status(status).render('portal/title', { title: t.title, t, form: form || t.form || {}, errors, FIELDS: F.FIELDS, editable: T.EDITABLE.includes(t.status), LABEL, NEXT });
}

r.get('/', wrap(async (req, res) => {
  res.render('portal/titles', { title: 'Titles', rows: await T.listOwn(pid(req)), eligible: await T.eligible(pid(req)), LABEL });
}));
r.post('/new', wrap(async (req, res) => {
  try { const t = await T.create(pid(req), req.user, req.body.title); return res.redirect(`/portal/titles/${t.id}`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect('/portal/titles'); }
}));
r.get('/:id', wrap(async (req, res, next) => { const t = await load(req, res, next); if (t) await render(req, res, t); }));
r.post('/:id/save', wrap(async (req, res, next) => {
  const t = await load(req, res, next); if (!t) return;
  const form = { ...F.clean(req.body), title: t.title };
  const errors = F.validate(form);
  if (errors.length) return render(req, res, t, { errors, form: { ...t.form, ...form }, status: 422 });
  try { await T.saveDraft(t.id, pid(req), req.user, form); flash(req, 'success', 'Draft saved.'); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/titles/${t.id}`);
}));
r.post('/:id/submit', wrap(async (req, res, next) => {
  const t = await load(req, res, next); if (!t) return;
  const form = { ...F.clean(req.body), title: t.title };
  const errors = F.validate(form, { submit: true });
  if (errors.length) return render(req, res, t, { errors, form: { ...t.form, ...form }, status: 422 });
  try { await T.saveDraft(t.id, pid(req), req.user, form); await T.submit(t.id, pid(req), req.user); flash(req, 'success', 'Submitted. You will be told here and by email what LIV decides.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/titles/${t.id}`);
}));
r.post('/:id/withdraw', wrap(async (req, res, next) => {
  const t = await load(req, res, next); if (!t) return;
  try { await T.withdraw(t.id, pid(req), req.user); flash(req, 'success', 'The request was withdrawn.'); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/portal/titles/${t.id}`);
}));

module.exports = r;
