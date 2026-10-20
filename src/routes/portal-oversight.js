// Portal: monitoring notices and material-change notices (Batch H). A provider sees only its own records.
const express = require('express');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const I = require('../lib/indicators');
const PR = require('../lib/partner-records');

const r = express.Router();
r.use(requirePlatformAdmin);
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot answer a monitoring notice on behalf of a provider.' }) : next()));
const UUID_RE = /^[0-9a-f-]{36}$/i;
const pid = (req) => req.user.platform_id;

r.get('/', wrap(async (req, res) => {
  res.render('portal/oversight', { title: 'Notices and changes', cases: await I.forProvider(pid(req)), changes: await PR.changesFor(pid(req)), CHANGE_KINDS: PR.CHANGE_KINDS, CHANGE_STATUS: PR.CHANGE_STATUS, OUTCOMES: I.OUTCOMES });
}));
r.post('/cases/:id/respond', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { await I.respond(req.params.id, pid(req), req.user, req.body.response); flash(req, 'success', 'Your response is with LIV. It is reviewed by a member of staff.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/portal/oversight');
}));
r.post('/changes', wrap(async (req, res) => {
  try { await PR.recordChange(pid(req), req.user, { change_kind: req.body.change_kind, description: req.body.description, effective_on: req.body.effective_on }); flash(req, 'success', 'Notice sent. LIV acknowledges it or opens a review.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/portal/oversight');
}));

module.exports = r;
