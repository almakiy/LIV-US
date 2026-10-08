const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const { limiter, wrap } = require('../lib/guards');
const totp = require('../lib/totp');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
const DUMMY = bcrypt.hashSync('timing-equalizer', 12); // compared when the email is unknown
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : null);

r.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.realRole === 'super_admin' ? '/admin' : '/portal');
  res.render('public/login', { title: 'Log in', error: null, email: '', next: safeNext(req.query.next) || '' });
});

const homeFor = (u) => (u.role === 'super_admin' ? '/admin' : '/portal');
async function startSession(req, res, u, next) {
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Could not start session.' });
    req.session.userId = u.id;
    await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    await audit({ user: u, platformId: u.platform_id, action: 'user.login', target: u.email }).catch(() => {});
    res.redirect(next || homeFor(u));
  });
}

r.post('/login', limiter(15, 20), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows: [u] } = await q('SELECT id, email, role, platform_id, password_hash, totp_enabled FROM users WHERE email = $1', [email]);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) {
    return res.status(401).render('public/login', { title: 'Log in', error: 'Incorrect email or password.', email, next: safeNext(req.body.next) || '' });
  }
  if (refusedPassword(password)) {
    await audit({ user: u, platformId: u.platform_id, action: 'user.login_refused_dev_password', target: u.email }).catch(() => {});
    return res.status(403).render('public/login', { title: 'Log in', email, next: safeNext(req.body.next) || '',
      error: 'This account still uses a development password that is published in the documentation, so it cannot sign in on this server. LIV administrators: set the ADMIN_RESET_PASSWORD secret and restart the app. Education Partners: ask LIV to reset your password.' });
  }
  if (u.totp_enabled) {
    // Password correct, second factor pending: no signed-in session yet.
    req.session.pending2fa = { id: u.id, next: safeNext(req.body.next) || '', at: Date.now(), tries: 0 };
    return res.redirect('/login/2fa');
  }
  startSession(req, res, u, safeNext(req.body.next));
}));

r.get('/login/2fa', (req, res) => {
  const p = req.session.pending2fa;
  if (!p || Date.now() - p.at > 5 * 60 * 1000) return res.redirect('/login');
  res.render('public/login-2fa', { title: 'Two-factor sign-in', error: null });
});
r.post('/login/2fa', limiter(15, 20), wrap(async (req, res) => {
  const p = req.session.pending2fa;
  if (!p || Date.now() - p.at > 5 * 60 * 1000) return res.redirect('/login');
  const fail = (m) => {
    p.tries += 1;
    if (p.tries >= 5) { delete req.session.pending2fa; return res.status(401).render('public/login', { title: 'Log in', error: 'Too many wrong codes. Sign in again.', email: '', next: '' }); }
    req.session.pending2fa = p;
    return res.status(401).render('public/login-2fa', { title: 'Two-factor sign-in', error: m });
  };
  const { rows: [u] } = await q('SELECT id, email, role, platform_id, totp_secret_enc, totp_last_step, recovery_hashes FROM users WHERE id = $1 AND totp_enabled', [p.id]);
  if (!u) return res.redirect('/login');
  const input = String(req.body.code || '').trim();
  const step = totp.verify(totp.decryptSecret(u.totp_secret_enc), input, { lastStep: u.totp_last_step });
  if (step) {
    await q('UPDATE users SET totp_last_step = $1 WHERE id = $2 AND totp_last_step < $1', [step, u.id]);
  } else {
    // A recovery code works once.
    const h = totp.hashRecovery(input);
    const { rowCount } = /^[A-Za-z0-9-\s]{8,12}$/.test(input) && !/^\d{6}$/.test(input)
      ? await q('UPDATE users SET recovery_hashes = array_remove(recovery_hashes, $1) WHERE id = $2 AND $1 = ANY(recovery_hashes)', [h, u.id]) : { rowCount: 0 };
    if (!rowCount) return fail('That code is not valid.');
    await audit({ user: u, platformId: u.platform_id, action: 'user.2fa_recovery_used', target: u.email }).catch(() => {});
  }
  delete req.session.pending2fa;
  startSession(req, res, u, safeNext(p.next));
}));

// Leave "act on behalf of provider" mode (real role is still super_admin while acting).
r.post('/admin-exit', (req, res) => {
  if (req.user?.realRole === 'super_admin') delete req.session.actAs;
  res.redirect('/admin/platforms');
});

r.post('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('liv.sid'); res.redirect('/'); }));

module.exports = r;
