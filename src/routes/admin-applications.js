// Admin: review of partner applications (Batch E). Mounted under /admin. Every rule lives in the libraries; this only calls them.
const express = require('express');
const { q } = require('../db');
const { requireSuper, wrap, flash } = require('../lib/guards');
const A = require('../lib/applications');
const S = require('../lib/assessment');

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
  res.render('admin/application', { title: `Application: ${data.app.company_name}`, ...data, CRITERIA: S.CRITERIA, RESULTS: S.RESULTS, STAFF_MOVES, allowedBy: A.allowedBy });
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

// Staff read of private evidence; every read is logged by the library.
r.get('/applications/evidence/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try {
    const f = await A.readEvidence(req.params.id, req.user, { staff: true });
    res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' }).send(f.content);
  } catch (e) { if (e instanceof A.ApplicationError) return next(); throw e; }
}));

module.exports = r;
