// Admin: renewals, material-change notices and sanctions screening (Batch H). Mounted under /admin. Permissions come from the staff position.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const PR = require('../lib/partner-records');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const go = (fn) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const msg = await fn(req); flash(req, 'success', msg); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/admin/partner-records');
});

r.get('/partner-records', wrap(async (req, res) => {
  res.render('admin/partner-records', { title: 'Partner records', d: await PR.list(), CHANGE_KINDS: PR.CHANGE_KINDS, CHANGE_STATUS: PR.CHANGE_STATUS, SANCTION_RESULTS: PR.SANCTION_RESULTS, can: await P.can(req.user) });
}));
r.post('/partner-records/renewals', go(async (req) => { await PR.scheduleRenewal(String(req.body.platform_id || ''), req.user, { due_on: req.body.due_on, note: req.body.note }); return 'Renewal scheduled.'; }));
r.post('/partner-records/renewals/:id/decide', go(async (req) => { await PR.decideRenewal(req.params.id, req.user, { outcome: req.body.outcome, note: req.body.note }); return 'Renewal outcome recorded. The provider status is unchanged; any change is a separate decision.'; }));
r.post('/partner-records/renewals/:id/review', go(async (req) => { await PR.reviewLapsed(req.params.id, req.user); return 'Lapsed renewal reviewed. The provider status is unchanged.'; }));
r.post('/partner-records/changes/:id/handle', go(async (req) => { await PR.handleChange(req.params.id, req.user, { outcome: req.body.outcome, note: req.body.note }); return 'Notice handled.'; }));
r.post('/partner-records/sanctions', go(async (req) => {
  await PR.recordSanctions(String(req.body.platform_id || ''), req.user, { list_name: req.body.list_name, checked_on: req.body.checked_on, result: req.body.result, note: req.body.note });
  return 'Screening recorded.';
}));

module.exports = r;
