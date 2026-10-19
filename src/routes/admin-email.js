// Admin: the email queue and the suppression list (task 2.1). Mounted under /admin.
const express = require('express');
const { q } = require('../db');
const cfg = require('../config');
const { requireSuper, wrap, flash } = require('../lib/guards');
const email = require('../lib/email');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;

r.get('/email', wrap(async (req, res) => {
  const [{ rows }, { rows: counts }, { rows: sup }] = await Promise.all([
    q('SELECT id, to_email, template, subject, status, attempts, next_attempt_at, last_error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 100'),
    q('SELECT status, count(*)::int AS n FROM email_outbox GROUP BY status'),
    q('SELECT email, reason, created_at FROM email_suppressions ORDER BY created_at DESC'),
  ]);
  res.render('admin/email', { title: 'Email', rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), sup, driver: cfg.emailDriver, from: cfg.emailFrom });
}));
r.post('/email/:id/retry', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  flash(req, (await email.retry(req.params.id)) ? 'success' : 'error', 'Queued again.');
  res.redirect('/admin/email');
}));
r.post('/email/suppress', wrap(async (req, res) => {
  const e = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { flash(req, 'error', 'Enter a valid email address.'); return res.redirect('/admin/email'); }
  await email.suppress(e, 'manual'); flash(req, 'success', `${e} will no longer receive email from LIV.`); res.redirect('/admin/email');
}));
r.post('/email/unsuppress', wrap(async (req, res) => { await email.unsuppress(String(req.body.email || '')); flash(req, 'success', 'Removed from the suppression list.'); res.redirect('/admin/email'); }));

module.exports = r;
