// Admin: monitoring cases opened by indicators (Batch H). Mounted under /admin. Permissions come from the staff position on every call.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const I = require('../lib/indicators');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const go = (fn, back) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const o = await fn(req); flash(req, 'success', o.msg); return res.redirect(o.url); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect(back(req)); }
});

r.get('/monitoring', wrap(async (req, res) => {
  res.render('admin/monitoring', { title: 'Monitoring', rows: await I.list(), TRIGGERS: I.TRIGGERS, can: await P.can(req.user) });
}));
r.post('/monitoring/check', go(async () => {
  const n = await I.sweep();
  return { msg: `Indicator check run. ${n} case(s) moved to escalation.`, url: '/admin/monitoring' };
}, () => '/admin/monitoring'));
r.get('/monitoring/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  let k; try { k = await I.get(req.params.id); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
  res.render('admin/monitoring-case', { title: k.case_no, k, can: await P.can(req.user), OUTCOMES: I.OUTCOMES });
}));
r.post('/monitoring/:id/close', go(async (req) => {
  await I.close(req.params.id, req.user, { outcome: req.body.outcome, note: req.body.note });
  return { msg: 'The case is closed. The record is kept.', url: `/admin/monitoring/${req.params.id}` };
}, (req) => `/admin/monitoring/${req.params.id}`));

module.exports = r;
