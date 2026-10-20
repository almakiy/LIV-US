// Portal: the provider's partnership level and its review requests. A provider sees only its own.
const express = require('express');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const L = require('../lib/levels');

const r = express.Router();
r.use(requirePlatformAdmin);
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot request a level on behalf of a provider.' }) : next()));
const UUID_RE = /^[0-9a-f-]{36}$/i;
r.get('/', wrap(async (req, res) => res.render('portal/level', { title: 'Partnership level', d: await L.forProvider(req.user.platform_id), LABEL: L.LABEL, PLAN: L.PLAN, CRITERIA: L.CRITERIA, ORDER: L.ORDER })));
r.post('/request', wrap(async (req, res) => {
  try { await L.open(req.user.platform_id, req.user, 'provider'); flash(req, 'success', 'Your request is open. LIV will assess it against the published criteria.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/portal/level');
}));
r.post('/:id/withdraw', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { await L.withdraw(req.params.id, req.user.platform_id); flash(req, 'success', 'The request was withdrawn.'); res.redirect('/portal/level'); }
  catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));
module.exports = r;
