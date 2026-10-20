// Portal: trainers added after authorization (F2). A provider reaches only its own submissions; a foreign or missing id both return 404.
const express = require('express');
const multer = require('multer');
const { requirePlatformAdmin, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const TR = require('../lib/trainer-additions');

const r = express.Router();
r.use(requirePlatformAdmin);
r.use((req, res, next) => (req.user.actingAs ? res.status(403).render('error', { title: 'Not available', message: 'LIV staff cannot add trainers on behalf of a provider.' }) : next()));
const csrfCheck = (req, res, next) => req.app.locals.csrfCheck(req, res, next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: A.MAX_EVIDENCE_BYTES, files: 1 } });
const UUID_RE = /^[0-9a-f-]{36}$/i;
const pid = (req) => req.user.platform_id;
const LABEL = { submitted: 'With LIV', accepted: 'Accepted', refused: 'Refused', needs_more: 'Needs more information', withdrawn: 'Withdrawn' };
const file = (req) => (req.file ? { name: req.file.originalname, buffer: req.file.buffer } : null);
const wrapErr = (fn) => wrap(async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) { if (!(e instanceof A.ApplicationError)) throw e; if (e.status === 404) return next(); flash(req, 'error', e.message); res.redirect(req.get('referer') && /\/portal\/trainers/.test(req.get('referer')) ? new URL(req.get('referer')).pathname : '/portal/trainers'); }
});

r.get('/', wrap(async (req, res) => res.render('portal/trainers', { title: 'Trainers', rows: await TR.listOwn(pid(req)), scopes: await TR.scopesOf(pid(req)), LABEL })));
r.post('/new', upload.single('file'), csrfCheck, wrapErr(async (req, res) => { const o = await TR.submit(pid(req), req.user, req.body, file(req)); flash(req, 'success', 'Submitted. LIV will review the trainer.'); res.redirect(`/portal/trainers/${o.id}`); }));
r.get('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { res.render('portal/trainer', { title: 'Trainer', t: await TR.getOwn(req.params.id, pid(req)), scopes: await TR.scopesOf(pid(req)), LABEL }); } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));
r.post('/:id/resubmit', upload.single('file'), csrfCheck, wrapErr(async (req, res) => { if (!UUID_RE.test(req.params.id)) throw new A.ApplicationError('Not found.', 404); await TR.resubmit(req.params.id, pid(req), req.user, req.body, file(req)); flash(req, 'success', 'Submitted again.'); res.redirect(`/portal/trainers/${req.params.id}`); }));
r.post('/:id/withdraw', wrapErr(async (req, res) => { if (!UUID_RE.test(req.params.id)) throw new A.ApplicationError('Not found.', 404); await TR.withdraw(req.params.id, pid(req), req.user); flash(req, 'success', 'Withdrawn.'); res.redirect(`/portal/trainers/${req.params.id}`); }));
r.get('/:id/document', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { const f = await TR.readDocument(req.params.id, req.user, { platformId: pid(req) }); res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content); }
  catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));
module.exports = r;
