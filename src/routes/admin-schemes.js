// Admin: credential schemes (status and public text) and partner authorized scope. Mounted under /admin.
const express = require('express');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const { requireSuper, wrap, flash } = require('../lib/guards');
const store = require('../lib/scheme-store');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v, max) => String(v ?? '').trim().slice(0, max);

r.get('/schemes', wrap(async (req, res) => {
  const schemes = await store.listSchemes();
  const { rows: counts } = await q(`SELECT scheme_id, count(*)::int AS n FROM partner_scopes WHERE status = 'active' AND scheme_id IS NOT NULL GROUP BY scheme_id`);
  res.render('admin/schemes', { title: 'Credential schemes', schemes, counts: Object.fromEntries(counts.map((c) => [c.scheme_id, c.n])), SCHEME_STATUS: store.SCHEME_STATUS, RECORD_TYPES: store.RECORD_TYPES });
}));

// Publishing a scheme needs an approved version: none exists until scheme governance approves one.
r.post('/schemes/:id/status', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id) || !store.SCHEME_STATUS[req.body.status]) return next();
  if (req.body.status === 'published') {
    const { rows: [v] } = await q(`SELECT 1 FROM scheme_versions WHERE scheme_id = $1 AND status = 'approved'`, [req.params.id]);
    if (!v) { flash(req, 'error', 'A scheme can be published only when it has an approved version (eligibility, assessment and credential rules). None is approved yet.'); return res.redirect('/admin/schemes'); }
  }
  const { rows: [s] } = await q('UPDATE credential_schemes SET status = $1, updated_at = now() WHERE id = $2 RETURNING slug', [req.body.status, req.params.id]);
  if (s) await audit({ user: req.user, action: 'scheme.status', target: s.slug, metadata: { to: req.body.status } });
  flash(req, 'success', 'Scheme status updated.');
  res.redirect('/admin/schemes');
}));

r.post('/platforms/:id/scopes', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const back = `/admin/platforms/${req.params.id}#scope`;
  const title = t(req.body.title, 200);
  const schemeId = UUID_RE.test(req.body.scheme_id || '') ? req.body.scheme_id : null;
  const granted = DATE_RE.test(req.body.granted_on || '') ? req.body.granted_on : null;
  const ends = DATE_RE.test(req.body.ends_on || '') ? req.body.ends_on : null;
  const note = t(req.body.decision_note, 500);
  if (!title) { flash(req, 'error', 'Enter the authorized course or curriculum title (it must match the course name on completion reports).'); return res.redirect(back); }
  if (!note) { flash(req, 'error', 'Record the basis for the authorization decision (review reference or note).'); return res.redirect(back); }
  if (ends && granted && ends < granted) { flash(req, 'error', 'The end date is before the start date.'); return res.redirect(back); }
  const { rows: [s] } = await q(`INSERT INTO partner_scopes (platform_id, scheme_id, title, granted_on, ends_on, decision_note, created_by)
    VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$7) RETURNING id`, [req.params.id, schemeId, title, granted, ends, note, req.user.id]);
  await audit({ user: req.user, platformId: req.params.id, action: 'scope.add', target: s.id, metadata: { title, scheme_id: schemeId } });
  flash(req, 'success', `Authorized scope added: ${title}.`);
  res.redirect(back);
}));

r.post('/scopes/:id/status', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id) || !store.SCOPE_STATUS[req.body.status]) return next();
  const reason = t(req.body.reason, 500);
  const { rows: [s] } = await q(`UPDATE partner_scopes SET status = $1, updated_at = now(),
      decision_note = CASE WHEN $3 = '' THEN decision_note ELSE decision_note || ' | ' || $3 END WHERE id = $2 RETURNING platform_id, title`, [req.body.status, req.params.id, reason]);
  if (!s) return next();
  await audit({ user: req.user, platformId: s.platform_id, action: 'scope.status', target: req.params.id, metadata: { to: req.body.status, reason } });
  flash(req, 'success', `Scope "${s.title}" is now ${req.body.status}.`);
  res.redirect(`/admin/platforms/${s.platform_id}#scope`);
}));

module.exports = r;
