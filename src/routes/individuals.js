// Individuals portal (M1), public part: sign-up, email confirmation and password reset for individual accounts.
// Answers never reveal whether an email already has an account.
const express = require('express');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const email = require('../lib/email');
const I = require('../lib/individuals');
const { limiter, wrap, flash } = require('../lib/guards');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
const closed = (res) => res.status(404).render('error', { title: 'Not available', message: 'Individual accounts are not open yet.' });

r.get('/signup', (req, res) => {
  if (!cfg.individualAccounts) return closed(res);
  if (req.user) return res.redirect('/login');
  res.render('public/signup', { title: 'Create an account', errors: [], form: {} });
});

r.post('/signup', limiter(15, 10), wrap(async (req, res) => {
  if (!cfg.individualAccounts) return closed(res);
  const form = { full_name: String(req.body.full_name || '').trim(), email: I.normEmail(req.body.email), marketing: req.body.marketing === 'yes' };
  const errors = I.validateSignup({ ...form, password: String(req.body.password || ''), confirm: String(req.body.confirm_password || ''), terms: req.body.terms === 'yes' });
  if (!errors.length && refusedPassword(String(req.body.password))) errors.push('That is a published development password; choose another one.');
  if (errors.length) return res.status(400).render('public/signup', { title: 'Create an account', errors, form });
  const { rows: [existing] } = await q('SELECT id FROM users WHERE lower(email) = $1', [form.email]);
  if (existing) {
    await email.queue({ to: form.email, template: 'individual_exists', dedupeKey: `exists:${form.email}:${new Date().toISOString().slice(0, 10)}` });
  } else {
    const { rows: [u] } = await q(`INSERT INTO users (role, full_name, email, password_hash, marketing_opt_in, marketing_opt_in_at)
      VALUES ('individual',$1,$2,$3,$4,$5) RETURNING id, email, role`,
    [form.full_name.slice(0, 200), form.email, await bcrypt.hash(String(req.body.password), 12), form.marketing, form.marketing ? new Date() : null]);
    const token = await I.newToken(u.id, 'verify_email', u.email);
    await email.queue({ to: u.email, name: form.full_name, template: 'individual_verify', data: { name: form.full_name, token } });
    await audit({ user: u, action: 'individual.signup', target: u.email, metadata: { marketing_opt_in: form.marketing } });
  }
  res.render('public/signup-done', { title: 'Check your email', email: form.email });
}));

r.get('/signup/verify', wrap(async (req, res) => {
  const t = await I.consumeToken(req.query.t, 'verify_email');
  if (!t) return res.status(400).render('error', { title: 'Link not valid', message: 'This confirmation link is not valid or has expired. Sign in and ask for a new one.' });
  await q(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND lower(email) = $2`, [t.user_id, t.email]);
  await audit({ actorLabel: t.email, action: 'individual.email_verified', target: t.email });
  flash(req, 'success', 'Your email address is confirmed.');
  res.redirect(req.user ? '/me' : '/login?next=/me');
}));

r.get('/password/forgot', (req, res) => res.render('public/password-forgot', { title: 'Reset your password', sent: false }));
r.post('/password/forgot', limiter(15, 5), wrap(async (req, res) => {
  const addr = I.normEmail(req.body.email);
  // Only individual accounts reset by email. Provider and LIV staff accounts follow their own procedure.
  const { rows: [u] } = I.EMAIL_RE.test(addr) ? await q(`SELECT id, email FROM users WHERE lower(email) = $1 AND role = 'individual' AND disabled_at IS NULL`, [addr]) : { rows: [] };
  if (u) {
    const token = await I.newToken(u.id, 'password_reset', u.email);
    await email.queue({ to: u.email, template: 'individual_reset', data: { token } });
    await audit({ user: u, action: 'individual.password_reset_request', target: u.email });
  }
  res.render('public/password-forgot', { title: 'Reset your password', sent: true });
}));

r.get('/password/reset', (req, res) => res.render('public/password-reset', { title: 'Choose a new password', token: String(req.query.t || ''), error: null }));
r.post('/password/reset', limiter(15, 10), wrap(async (req, res) => {
  const nw = String(req.body.new_password || ''); const nw2 = String(req.body.confirm_password || ''); const token = String(req.body.token || '');
  const fail = (m) => res.status(400).render('public/password-reset', { title: 'Choose a new password', token, error: m });
  if (nw.length < 10) return fail('The new password must be at least 10 characters.');
  if (nw !== nw2) return fail('The new passwords do not match.');
  if (refusedPassword(nw)) return fail('That is a published development password; choose another one.');
  const t = await I.consumeToken(token, 'password_reset');
  if (!t) return fail('This reset link is not valid or has expired. Ask for a new one.');
  const { rows: [u] } = await q(`UPDATE users SET password_hash = $1, password_changed_at = now(), must_change_password = false WHERE id = $2 AND role = 'individual' RETURNING id, email`,
    [await bcrypt.hash(nw, 12), t.user_id]);
  if (!u) return fail('This reset link is not valid or has expired. Ask for a new one.');
  await q(`DELETE FROM sessions WHERE sess->>'userId' = $1`, [u.id]).catch(() => {});
  await audit({ user: u, action: 'individual.password_reset', target: u.email });
  flash(req, 'success', 'Your password is changed. Sign in with the new password.');
  res.redirect('/login');
}));

module.exports = r;
