// Admin: policy exceptions. Any staff account prepares; only the main account approves. Mounted under /admin.
const express = require('express');
const { q } = require('../db');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const X = require('../lib/exceptions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const act = (fn, back) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const to = await fn(req); flash(req, 'success', to.msg); return res.redirect(to.url); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); return res.redirect(back(req)); }
});

r.get('/exceptions', wrap(async (req, res) => res.render('admin/exceptions', { title: 'Exceptions', rows: await X.list(), recurring: await X.recurrence(), CASE_TYPES: X.CASE_TYPES })));
r.get('/exceptions/new', wrap(async (req, res) => {
  const { rows: platforms } = await q('SELECT id, company_name FROM platforms ORDER BY company_name');
  res.render('admin/exception-new', { title: 'Prepare an exception', CASE_TYPES: X.CASE_TYPES, FORBIDDEN: X.FORBIDDEN, platforms });
}));
r.post('/exceptions', act(async (req) => { const e = await X.prepare(req.user, req.body); return { msg: 'Prepared. The main account decides.', url: `/admin/exceptions/${e.id}` }; }, () => '/admin/exceptions/new'));
r.get('/exceptions/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  let e; try { e = await X.get(req.params.id); } catch (err) { if (err instanceof A.ApplicationError) return next(); throw err; }
  res.render('admin/exception', { title: 'Exception', e, main: await X.isMainAccount(req.user), CASE_TYPES: X.CASE_TYPES });
}));
r.post('/exceptions/:id/decide', act(async (req) => { const o = await X.decide(req.params.id, req.user, { outcome: req.body.outcome, reason: req.body.reason }); return { msg: `Recorded: ${o.status}.`, url: `/admin/exceptions/${req.params.id}` }; }, (req) => `/admin/exceptions/${req.params.id}`));
r.post('/exceptions/:id/close', act(async (req) => { await X.close(req.params.id, req.user, req.body.note); return { msg: 'Closed.', url: `/admin/exceptions/${req.params.id}` }; }, (req) => `/admin/exceptions/${req.params.id}`));

module.exports = r;
