// Admin: review and decision of title requests (F2). Mounted under /admin. Permissions come from the staff position on every call.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const T = require('../lib/titles');
const P = require('../lib/positions');
const TF = require('../lib/title-form');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const act = (fn) => wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { flash(req, 'success', await fn(req)); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/admin/titles/${req.params.id}`);
});

r.get('/titles', wrap(async (req, res) => res.render('admin/titles', { title: 'Title requests', rows: await T.listAll() })));
r.get('/titles/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  let t; try { t = await T.getForStaff(req.params.id); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
  res.render('admin/title', { title: t.title, t, can: await P.can(req.user), FIELDS: T.formFor(t.kind).FIELDS, lines: TF.lines });
}));
r.post('/titles/:id/review', act(async (req) => { const o = await T.review(req.params.id, req.user, { recommendation: req.body.recommendation, note: req.body.note }); return `Recorded. The request is now ${o.status.replace(/_/g, ' ')}.`; }));
r.post('/titles/:id/decide', act(async (req) => { const o = await T.decide(req.params.id, req.user, { outcome: req.body.outcome, reason: req.body.reason }); return `Decision recorded: ${o.status}.`; }));

module.exports = r;
