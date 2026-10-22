// Admin > Preview accounts: a preview training provider and preview individuals for trying new features, and a log of
// periodic checks. Any LIV staff account can read this page; only the main account creates or opens a preview account.
const express = require('express');
const { audit } = require('../lib/audit');
const P = require('../lib/preview');
const { isMainAccount } = require('../lib/exceptions');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use('/preview', requireSuper);
const mainOnly = wrap(async (req, res, next) => {
  if (await isMainAccount(req.user)) return next();
  flash(req, 'error', 'Only the main account opens or creates preview accounts.');
  res.redirect('/admin/preview');
});

r.get('/preview', wrap(async (req, res) => {
  res.render('admin/preview', { title: 'Preview accounts', partner: await P.partner(), people: await P.individuals(), history: await P.history(),
    isMain: await isMainAccount(req.user), hasData: await P.hasData(), lastRun: req.session.previewRun || null, scopeTitle: P.SCOPE_TITLE });
}));

r.post('/preview/partner', mainOnly, wrap(async (req, res) => {
  await P.ensurePartner(req.user);
  flash(req, 'success', 'The preview training provider is ready.');
  res.redirect('/admin/preview');
}));

r.post('/preview/partner/open', mainOnly, wrap(async (req, res) => {
  const p = await P.partner();
  if (!p) { flash(req, 'error', 'Create the preview training provider first.'); return res.redirect('/admin/preview'); }
  req.session.actAs = p.id; req.session.previewReturn = true;
  await audit({ user: req.user, platformId: p.id, action: 'preview.partner_open', target: p.company_name });
  res.redirect('/portal');
}));

r.post('/preview/individual/:key', mainOnly, wrap(async (req, res) => {
  try { await P.ensureIndividual(req.user, req.params.key); flash(req, 'success', 'The preview individual is ready.'); }
  catch (e) { flash(req, 'error', e.message); }
  res.redirect('/admin/preview');
}));

r.post('/preview/individual/:key/open', mainOnly, wrap(async (req, res) => {
  const person = (await P.individuals()).find((x) => x.key === req.params.key);
  if (!person?.account) { flash(req, 'error', 'Create this preview individual first.'); return res.redirect('/admin/preview'); }
  delete req.session.actAs;
  req.session.actAsIndividual = person.account.id; req.session.previewReturn = true;
  await audit({ user: req.user, action: 'preview.individual_open', target: person.account.email });
  res.redirect('/me');
}));

r.post('/preview/reset', mainOnly, wrap(async (req, res) => {
  const counts = await P.resetData(req.user, 'manual');
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  flash(req, 'success', n ? 'Preview data cleared. The preview accounts are back to their starting state.' : 'There was no preview data to clear.');
  res.redirect('/admin/preview');
}));

r.post('/preview/checks/run', wrap(async (req, res) => {
  const results = await P.runChecks();
  await P.recordRun(req.user, results);
  req.session.previewRun = results;
  const failed = results.filter((x) => !x.ok).length;
  flash(req, failed ? 'error' : 'success', failed ? `${failed} check(s) need attention.` : 'All automatic checks passed.');
  res.redirect('/admin/preview#checks');
}));

r.post('/preview/checks', wrap(async (req, res) => {
  try { await P.recordManual(req.user, req.body); flash(req, 'success', 'Check recorded.'); } catch (e) { flash(req, 'error', e.message); }
  res.redirect('/admin/preview#log');
}));

module.exports = r;
