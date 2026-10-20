// Admin: partnership level reviews (Bronze, Silver, Gold). Mounted under /admin. Permissions come from the staff position on every call.
const express = require('express');
const { q } = require('../db');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const L = require('../lib/levels');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const go = (fn, back) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const o = await fn(req); flash(req, 'success', o.msg); return res.redirect(o.url); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect(back(req)); }
});

r.get('/levels', wrap(async (req, res) => {
  const { rows: platforms } = await q(`SELECT id, company_name, level, public_number FROM platforms WHERE accreditation_status = 'active' ORDER BY company_name`);
  res.render('admin/levels', { title: 'Partnership levels', rows: await L.list(), platforms, LABEL: L.LABEL, VERSION: L.VERSION });
}));
r.post('/levels/open', go(async (req) => { const rv = await L.open(String(req.body.platform_id || ''), req.user, 'liv'); return { msg: 'Review opened.', url: `/admin/levels/${rv.id}` }; }, () => '/admin/levels'));
r.post('/levels/open-lower', go(async (req) => { const rv = await L.openDemotion(String(req.body.platform_id || ''), req.user); return { msg: 'Lower-level review opened.', url: `/admin/levels/${rv.id}` }; }, () => '/admin/levels'));
r.get('/levels/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  let rv; try { rv = await L.get(req.params.id); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
  res.render('admin/level', { title: 'Level review', rv, can: await P.can(req.user), LABEL: L.LABEL, PLAN: L.PLAN, VERSION: L.VERSION });
}));
r.post('/levels/:id/assess', go(async (req) => {
  const answers = {};
  for (const k of Object.keys(req.body)) { const m = /^met_(\w+)$/.exec(k); if (m) answers[m[1]] = { met: req.body[k] === 'yes', note: req.body[`note_${m[1]}`] }; }
  for (const k of Object.keys(req.body)) { const m = /^note_(\w+)$/.exec(k); if (m && !answers[m[1]]) answers[m[1]] = { met: false, note: req.body[k] }; }
  const o = await L.assess(req.params.id, req.user, { answers, note: req.body.note, demote: req.body.demote === 'yes' });
  return { msg: `Assessment recorded. Recommendation: ${o.recommendation.replace('_', ' ')}.`, url: `/admin/levels/${req.params.id}` };
}, (req) => `/admin/levels/${req.params.id}`));
r.post('/levels/:id/decide', go(async (req) => {
  const o = await L.decide(req.params.id, req.user, { outcome: req.body.outcome, reason: req.body.reason });
  return { msg: o.outcome === 'not_yet' ? 'Recorded: not yet.' : `The level is now ${L.LABEL[o.to]}. Adjust the plan and any fee difference in Admin > Billing.`, url: `/admin/levels/${req.params.id}` };
}, (req) => `/admin/levels/${req.params.id}`));

module.exports = r;
