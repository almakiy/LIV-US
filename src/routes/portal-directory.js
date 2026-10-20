// Portal: the provider's public directory details, branch requests and their status (October 20, 2026). A provider sees only its own.
const express = require('express');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const D = require('../lib/directory');

const r = express.Router();
r.use(requirePlatformAdmin);
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot change a provider directory entry on behalf of a provider.' }) : next()));
const pid = (req) => req.user.platform_id;
const back = '/portal/directory';
const run = (fn) => wrap(async (req, res) => {
  try { const msg = await fn(req); if (msg) flash(req, 'success', msg); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(back);
});

r.get('/', wrap(async (req, res) => {
  res.render('portal/directory', { title: 'Public directory', v: await D.providerView(pid(req)), PROFILE: D.PROFILE, BRANCH: D.BRANCH });
}));
r.post('/profile', run(async (req) => { await D.proposeProfile(pid(req), req.user, req.body); return 'Your change is sent to LIV for review. The published details stay the same until LIV approves it.'; }));
r.post('/branches', run(async (req) => { await D.requestBranch(pid(req), req.user, req.body); return 'Branch request sent to LIV. It is not shown publicly until LIV approves it.'; }));
r.post('/branches/:id/withdraw', run(async (req) => { if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return null; await D.withdrawBranch(req.params.id, pid(req), req.user); return 'Branch request withdrawn.'; }));

module.exports = r;
