const express = require('express');
const bcrypt = require('bcryptjs');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const { limiter, wrap } = require('../lib/guards');

const r = express.Router();
const DUMMY = bcrypt.hashSync('timing-equalizer', 12); // compared when the email is unknown
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : null);

r.get('/login', (req, res) => {
  if (req.user) return res.redirect(req.user.role === 'super_admin' ? '/admin' : '/portal');
  res.render('public/login', { title: 'Log in', error: null, email: '', next: safeNext(req.query.next) || '' });
});

r.post('/login', limiter(15, 20), wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows: [u] } = await q('SELECT id, email, role, platform_id, password_hash FROM users WHERE email = $1', [email]);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY);
  if (!u || !ok) {
    return res.status(401).render('public/login', { title: 'Log in', error: 'Incorrect email or password.', email, next: safeNext(req.body.next) || '' });
  }
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).render('error', { title: 'Error', message: 'Could not start session.' });
    req.session.userId = u.id;
    await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    await audit({ user: u, platformId: u.platform_id, action: 'user.login', target: u.email }).catch(() => {});
    res.redirect(safeNext(req.body.next) || (u.role === 'super_admin' ? '/admin' : '/portal'));
  });
}));

r.post('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('liv.sid'); res.redirect('/'); }));

module.exports = r;
