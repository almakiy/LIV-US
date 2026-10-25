// Admin > Legal documents: read the drafts in docs/legal, publish an approved text (main account only), or put it back to draft.
const express = require('express');
const L = require('../lib/legal');
const { isMainAccount } = require('../lib/exceptions');
const { renderMarkdown } = require('../lib/content');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use('/legal', requireSuper);
const act = (fn) => wrap(async (req, res) => {
  try { flash(req, 'success', await fn(req)); } catch (e) { if (!(e instanceof L.LegalError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/admin/legal/${req.params.slug}`);
});

r.get('/legal', wrap(async (req, res) => res.render('admin/legal', { title: 'Legal documents', docs: await L.list(), isMain: await isMainAccount(req.user) })));
r.get('/legal/:slug', wrap(async (req, res, next) => {
  const d = L.readDraft(req.params.slug);
  if (!d) return next();
  const pub = await L.live(d.slug);
  res.render('admin/legal-doc', { title: d.title, d, pub, changed: Boolean(pub) && pub.sha256 !== d.sha256, history: await L.history(d.slug),
    html: renderMarkdown(L.relink(d.body, '/admin/legal/')), isMain: await isMainAccount(req.user) });
}));
r.post('/legal/:slug/publish', act((req) => L.publish(req.user, req.params.slug, req.body)));
r.post('/legal/:slug/withdraw', act((req) => L.withdraw(req.user, req.params.slug)));

module.exports = r;
