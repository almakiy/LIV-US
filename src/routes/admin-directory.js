// Admin: review of public profile changes, branch requests and scope details (October 20, 2026). Mounted under /admin.
// Permissions come from the staff position on every call: assessing profile changes and branch facts, deciding branches and scope details.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const D = require('../lib/directory');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const go = (fn, back) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const msg = await fn(req); flash(req, 'success', msg); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(back);
});

r.get('/quote-requests', wrap(async (req, res) => res.render('admin/quote-requests', { title: 'Training requests', rows: await require('../lib/quotes').adminList() })));
r.get('/directory', wrap(async (req, res) => {
  res.render('admin/directory', { title: 'Directory changes', d: await D.staffQueue(), can: await P.can(req.user), PROFILE: D.PROFILE, SCOPE_FIELDS: D.SCOPE_FIELDS });
}));
r.post('/directory/profiles/:id/decide', go(async (req) => {
  await D.decideProfile(req.params.id, req.user, { outcome: req.body.outcome, note: req.body.note });
  return req.body.outcome === 'approved' ? 'Change approved and published.' : 'Change rejected. The published details stay as they were.';
}, '/admin/directory'));
r.post('/directory/branches/:id/decide', go(async (req) => {
  // One checkbox per requested scope (approve_<scope id>) and one delivery field per scope (methods_<scope id>).
  const scopes = Object.keys(req.body).filter((k) => /^approve_/.test(k)).map((k) => ({ scope_id: k.slice(8), approve: true, delivery_methods: req.body[`methods_${k.slice(8)}`] || '' }));
  await D.decideBranch(req.params.id, req.user, { outcome: req.body.outcome, note: req.body.note, scopes });
  return req.body.outcome === 'approved' ? 'Branch approved for the scopes you chose.' : 'Branch request refused.';
}, '/admin/directory'));
r.post('/directory/scopes/:id', go(async (req) => {
  await D.updateScope(req.params.id, req.user, req.body);
  return 'Scope details recorded. The revision is raised and the change is in the audit log.';
}, '/admin/directory'));

module.exports = r;
