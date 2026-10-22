// Admin: individual accounts and credential claim requests (Individuals portal, M1). Mounted under /admin.
// Deciding a claim request is an ordinary delegated task for LIV staff; it needs a recorded reason and is audited.
const express = require('express');
const { q } = require('../db');
const email = require('../lib/email');
const I = require('../lib/individuals');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use('/individuals', requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;

r.get('/individuals', wrap(async (req, res) => {
  const { rows: [stats] } = await q(`SELECT count(*)::int AS accounts, count(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS verified,
      count(*) FILTER (WHERE marketing_opt_in)::int AS marketing, count(*) FILTER (WHERE closure_requested_at IS NOT NULL)::int AS closures,
      (SELECT count(*)::int FROM credential_claims WHERE released_at IS NULL) AS linked
    FROM users WHERE role = 'individual'`);
  const { rows: requests } = await q(`SELECT r.*, u.full_name, u.email, c.id AS cert_id, c.recipient_first_name || ' ' || c.recipient_last_name AS recipient, c.course_name,
      (SELECT 1 FROM credential_claims cl WHERE cl.certificate_id = c.id AND cl.released_at IS NULL) AS taken
    FROM credential_claim_requests r JOIN users u ON u.id = r.user_id LEFT JOIN certificates c ON c.cert_number = r.cert_number
    ORDER BY (r.status = 'submitted') DESC, r.created_at DESC LIMIT 200`);
  const { rows: people } = await q(`SELECT u.id, u.full_name, u.email, u.email_verified_at, u.created_at, u.closure_requested_at, u.disabled_at,
      (SELECT count(*)::int FROM credential_claims cl WHERE cl.user_id = u.id AND cl.released_at IS NULL) AS linked
    FROM users u WHERE u.role = 'individual' ORDER BY u.created_at DESC LIMIT 200`);
  res.render('admin/individuals', { title: 'Individuals', stats, requests, people });
}));

r.post('/individuals/requests/:id/decide', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const approve = req.body.decision === 'approve';
  try {
    const out = await I.decideRequest(req.user, req.params.id, { approve, reason: req.body.reason });
    const { rows: [u] } = await q('SELECT email, full_name FROM users WHERE id = $1', [out.user_id]);
    if (u) await email.queue({ to: u.email, name: u.full_name, template: 'claim_outcome', data: { cert: out.cert_number, approved: approve, reason: String(req.body.reason || '') }, dedupeKey: `claim:${out.id}` });
    flash(req, 'success', approve ? 'Approved. The credential is linked to the account.' : 'Refused. The person sees the reason.');
  } catch (e) {
    if (!(e instanceof I.IndividualError)) throw e;
    flash(req, 'error', e.message);
  }
  res.redirect('/admin/individuals');
}));

module.exports = r;
