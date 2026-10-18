// Admin: review of partner applications (Batch E). Mounted under /admin. Every rule lives in the libraries; this only calls them.
const express = require('express');
const { q } = require('../db');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const S = require('../lib/assessment');
const X = require('../lib/activation');
const P = require('../lib/positions');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const STAFF_MOVES = ['info_requested', 'technical_review', 'corrective_action', 'awaiting_decision'];

r.get('/applications', wrap(async (req, res) => {
  const { rows } = await q(`SELECT a.id, a.state, a.current_version, a.criteria_version, a.updated_at, p.company_name, p.country
    FROM partner_applications a JOIN platforms p ON p.id = a.platform_id
    ORDER BY (a.state IN ('completeness_check','technical_review','awaiting_decision')) DESC, a.updated_at DESC`);
  res.render('admin/applications', { title: 'Partner applications', rows });
}));

r.get('/applications/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  let data;
  try { data = await S.review(req.params.id); } catch (e) { if (e.status === 404) return next(); throw e; }
  const [act, can] = await Promise.all([X.getChecklist(req.params.id), P.can(req.user)]);
  res.render('admin/application', { title: `Application: ${data.app.company_name}`, ...data, act, can, CRITERIA: S.CRITERIA, RESULTS: S.RESULTS, STAFF_MOVES, allowedBy: A.allowedBy });
}));

// Same wrapper for every action: show the library's refusal as a message, never a stack trace.
const act = (fn) => wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { const msg = await fn(req); flash(req, 'success', msg); } catch (e) {
    if (!(e instanceof A.ApplicationError)) throw e;
    flash(req, 'error', e.message);
  }
  res.redirect(`/admin/applications/${req.params.id}`);
});

r.post('/applications/:id/move', act(async (req) => {
  const to = String(req.body.to || '');
  if (!STAFF_MOVES.includes(to)) throw new A.ApplicationError('Choose a valid next step.');
  await A.staffTransition(req.params.id, req.user, to, String(req.body.reason || ''));
  return `Application moved to ${to}.`;
}));

r.post('/applications/:id/assessment', act(async (req) => {
  const findings = {};
  for (const c of S.CRITERIA) findings[c] = { result: req.body[`result_${c}`], reason: req.body[`reason_${c}`], evidence_id: UUID_RE.test(req.body[`evidence_${c}`] || '') ? req.body[`evidence_${c}`] : '' };
  const { recommendation } = await S.recordAssessment(req.params.id, req.user, { summary: req.body.summary, findings });
  return `Assessment recorded. Recommendation: ${recommendation.outcome}.`;
}));

r.post('/applications/:id/recalculate', act(async (req) => `Recommendation recalculated: ${(await S.recalculate(req.params.id, req.user)).outcome}. The earlier one is kept.`));

r.post('/applications/:id/decision', act(async (req) => {
  const texts = [].concat(req.body.condition_text || []), blocking = [].concat(req.body.condition_blocking || []), due = [].concat(req.body.condition_due || []);
  const conditions = texts.map((text, i) => ({ text, blocking: blocking[i] === 'yes', due_date: due[i] || null }));
  const d = await S.decide(req.params.id, req.user, { outcome: req.body.outcome, reasons: req.body.reasons, conditions });
  return `Decision recorded: ${d.outcome}.`;
}));


r.post('/applications/:id/reverse', act(async (req) => { await S.reverseDecision(req.params.id, req.user, req.body.reasons); return 'The acceptance was reversed: the application is declined. The earlier decision is kept.'; }));

r.post('/applications/:id/trainer', act(async (req) => {
  await X.recordTrainer(req.params.id, req.user, { scope_id: req.body.scope_id, trainer_name: req.body.trainer_name, evidence_id: req.body.evidence_id, finding: req.body.finding });
  return 'Trainer record added.';
}));
r.post('/applications/:id/conditions/:cid/close', act(async (req) => {
  if (!UUID_RE.test(req.params.cid)) throw new A.ApplicationError('Condition not found.', 404);
  await X.closeCondition(req.params.id, req.user, req.params.cid, req.body.note);
  return 'Condition closed.';
}));
r.post('/applications/:id/test-issuance', act(async (req) => { await X.confirmTestIssuance(req.params.id, req.user, req.body.note); return 'Test issuance confirmed.'; }));
r.post('/applications/:id/activate', act(async (req) => { await X.activate(req.params.id, req.user); return 'The provider is now active. Its issuance still depends on an active authorized scope.'; }));

// Staff positions: appointed and released only by an account that holds no position (the owner admin).
const ownerOnly = wrap(async (req, res, next) => {
  const { rows: [u] } = await q('SELECT staff_position FROM users WHERE id = $1', [req.user.id]);
  if (u?.staff_position) return res.status(403).render('error', { title: 'Forbidden', message: 'Positions are managed by the owner administrator, not by a position holder.' });
  next();
});
r.get('/staff', wrap(async (req, res) => {
  const temp = req.session.newStaffPassword; delete req.session.newStaffPassword;
  res.render('admin/staff', { title: 'Staff positions', rows: await P.list(), temp, vacantDomain: P.VACANT_DOMAIN });
}));
r.post('/staff/:id/appoint', ownerOnly, wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { const a = await P.appoint(req.params.id, req.user, req.body); req.session.newStaffPassword = `${a.email}: ${a.temp}`; flash(req, 'success', 'Appointed. Give the temporary password below to the person securely; they must change it and set up two-factor sign-in at first sign-in.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/admin/staff');
}));
r.post('/staff/:id/release', ownerOnly, wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try { await P.release(req.params.id, req.user); flash(req, 'success', 'Position released. The person can no longer sign in to it.'); }
  catch (e) { if (!(e instanceof A.ApplicationError)) throw e; flash(req, 'error', e.message); }
  res.redirect('/admin/staff');
}));

// Staff read of private evidence; every read is logged by the library.
r.get('/applications/evidence/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try {
    const f = await A.readEvidence(req.params.id, req.user, { staff: true });
    res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content);
  } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));

module.exports = r;
