// Admin: review of trainers added after authorization (F2). Mounted under /admin. Permission comes from the staff position.
const express = require('express');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const TR = require('../lib/trainer-additions');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
r.get('/trainers', wrap(async (req, res) => res.render('admin/trainers', { title: 'Trainer submissions', rows: await TR.listAll() })));
r.get('/trainers/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { res.render('admin/trainer', { title: 'Trainer', t: await TR.getForStaff(req.params.id), can: await P.can(req.user) }); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));
r.post('/trainers/:id/review', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { const o = await TR.review(req.params.id, req.user, { outcome: req.body.outcome, finding: req.body.finding }); flash(req, 'success', o.outcome === 'accepted' ? `Accepted: ${o.scopes} trainer record(s) added.` : `Recorded: ${o.outcome.replace('_', ' ')}.`); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect(`/admin/trainers/${req.params.id}`);
}));
r.get('/trainers/:id/document', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { const f = await TR.readDocument(req.params.id, req.user, { staff: true }); res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content); }
  catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));
module.exports = r;
