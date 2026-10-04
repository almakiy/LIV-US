const express = require('express');
const { q } = require('../db');
const cfg = require('../config');
const { audit } = require('../lib/audit');
const { qrToken } = require('../lib/crypto');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const verifyLink = (c) => `${cfg.baseUrl}/verify/${c.cert_number}?t=${qrToken(c.verification_hash)}`;

r.get('/', wrap(async (req, res) => {
  const { rows: [s] } = await q(`SELECT
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='pending') AS pending,
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='active') AS active,
      (SELECT count(*)::int FROM platforms WHERE accreditation_status='suspended') AS suspended,
      (SELECT count(*)::int FROM certificates) AS certs,
      (SELECT count(*)::int FROM certificates WHERE status='revoked') AS revoked,
      (SELECT count(*)::int FROM contact_messages WHERE NOT handled) AS messages`);
  const { rows: daily } = await q(`SELECT d::date::text AS day, count(v.id)::int AS n,
        count(v.id) FILTER (WHERE v.result IN ('not_found','tampered','invalid_format'))::int AS bad
      FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d
      LEFT JOIN verification_logs v ON v.created_at::date = d::date
      GROUP BY d ORDER BY d`);
  const { rows: recent } = await q(`SELECT a.*, p.company_name FROM audit_logs a LEFT JOIN platforms p ON p.id = a.platform_id ORDER BY a.created_at DESC LIMIT 10`);
  res.render('admin/dashboard', { title: 'Admin overview', s, daily, recent });
}));

r.get('/platforms', wrap(async (req, res) => {
  const status = ['pending', 'active', 'suspended'].includes(req.query.status) ? req.query.status : '';
  const { rows } = await q(`SELECT p.*, (SELECT count(*)::int FROM certificates c WHERE c.platform_id = p.id) AS certs,
      (SELECT email FROM users u WHERE u.platform_id = p.id ORDER BY created_at LIMIT 1) AS owner_email
    FROM platforms p ${status ? 'WHERE accreditation_status = $1' : ''} ORDER BY (accreditation_status='pending') DESC, created_at DESC`, status ? [status] : []);
  res.render('admin/platforms', { title: 'Training platforms', rows, status });
}));

r.get('/platforms/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [p] } = await q('SELECT * FROM platforms WHERE id = $1', [req.params.id]);
  if (!p) return next();
  const { rows: users } = await q('SELECT full_name, email, last_login_at, created_at FROM users WHERE platform_id = $1', [p.id]);
  const { rows: [st] } = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='revoked')::int AS revoked FROM certificates WHERE platform_id=$1`, [p.id]);
  const { rows: log } = await q('SELECT * FROM audit_logs WHERE platform_id = $1 ORDER BY created_at DESC LIMIT 20', [p.id]);
  res.render('admin/platform', { title: p.company_name, p, users, st, log });
}));

r.post('/platforms/:id/status', wrap(async (req, res, next) => {
  const to = req.body.status;
  if (!UUID_RE.test(req.params.id) || !['active', 'suspended', 'pending'].includes(to)) return next();
  const { rows: [p] } = await q('UPDATE platforms SET accreditation_status=$1 WHERE id=$2 RETURNING company_name', [to, req.params.id]);
  if (!p) return next();
  await audit({ user: req.user, platformId: req.params.id, action: `platform.status.${to}`, target: p.company_name, metadata: { note: String(req.body.note || '').slice(0, 300) } });
  flash(req, 'success', `${p.company_name} is now ${to}.`);
  res.redirect(req.get('referer')?.includes('/admin/platforms/') ? `/admin/platforms/${req.params.id}` : '/admin/platforms');
}));

r.get('/certificates', wrap(async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const params = []; let w = 'TRUE';
  if (search) { params.push(`%${search.toLowerCase()}%`); w = `(lower(c.cert_number) LIKE $1 OR lower(c.recipient_first_name || ' ' || c.recipient_last_name) LIKE $1 OR lower(c.recipient_email) LIKE $1 OR lower(p.company_name) LIKE $1)`; }
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM certificates c JOIN platforms p ON p.id=c.platform_id WHERE ${w}`, params);
  const { rows } = await q(`SELECT c.*, p.company_name FROM certificates c JOIN platforms p ON p.id=c.platform_id WHERE ${w} ORDER BY c.created_at DESC LIMIT 25 OFFSET ${(page - 1) * 25}`, params);
  res.render('admin/certificates', { title: 'All certificates', rows, n, page, pages: Math.max(1, Math.ceil(n / 25)), search, verifyLink });
}));

r.post('/certificates/:num/revoke', wrap(async (req, res, next) => {
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const num = String(req.params.num).toUpperCase();
  if (reason.length < 5) { flash(req, 'error', 'A revocation reason (min 5 characters) is required.'); return res.redirect('/admin/certificates?q=' + encodeURIComponent(num)); }
  const { rows: [c] } = await q(`UPDATE certificates SET status='revoked', revoked_at=now(), revoked_by=$1, revocation_reason=$2 WHERE cert_number=$3 AND status='active' RETURNING platform_id`, [req.user.id, reason, num]);
  if (!c) return next();
  await audit({ user: req.user, platformId: c.platform_id, action: 'certificate.revoke', target: num, metadata: { reason, by: 'super_admin' } });
  flash(req, 'success', `Certificate ${num} revoked.`);
  res.redirect('/admin/certificates?q=' + encodeURIComponent(num));
}));

r.get('/audit', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { rows } = await q(`SELECT a.*, p.company_name FROM audit_logs a LEFT JOIN platforms p ON p.id = a.platform_id ORDER BY a.created_at DESC LIMIT 50 OFFSET ${(page - 1) * 50}`);
  res.render('admin/audit', { title: 'Audit log', rows, page });
}));

r.get('/messages', wrap(async (req, res) => {
  const { rows } = await q('SELECT * FROM contact_messages ORDER BY handled, created_at DESC LIMIT 200');
  res.render('admin/messages', { title: 'Contact messages', rows });
}));
r.post('/messages/:id/handled', wrap(async (req, res) => {
  await q('UPDATE contact_messages SET handled = true WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
  res.redirect('/admin/messages');
}));

module.exports = r;
