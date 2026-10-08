// Account security for any signed-in user: change password, two-factor sign-in (authenticator app) and recovery codes.
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const totp = require('../lib/totp');
const { requireLogin, limiter, wrap, flash } = require('../lib/guards');
const { refusedPassword } = require('../lib/dev-defaults');

const r = express.Router();
r.use(requireLogin);

async function me(req) { const { rows: [u] } = await q('SELECT * FROM users WHERE id = $1', [req.user.id]); return u; }
const back = (req, res, type, text, hash = '') => { flash(req, type, text); res.redirect(`/account/security${hash}`); };

r.get('/security', wrap(async (req, res) => {
  const u = await me(req);
  let setup = null;
  if (!u.totp_enabled) {
    if (!req.session.totpSetup) req.session.totpSetup = totp.generateSecret();
    const uri = totp.otpauthUri(u.email, req.session.totpSetup);
    setup = { secret: req.session.totpSetup, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
  }
  const recovery = req.session.newRecoveryCodes || null; delete req.session.newRecoveryCodes;
  res.render('account/security', { title: 'Account security', u, setup, recovery, remaining: (u.recovery_hashes || []).length, forced: u.must_change_password });
}));

r.post('/password', limiter(15, 10), wrap(async (req, res) => {
  const u = await me(req);
  const cur = String(req.body.current_password || ''); const nw = String(req.body.new_password || ''); const nw2 = String(req.body.confirm_password || '');
  if (!(await bcrypt.compare(cur, u.password_hash))) return back(req, res, 'error', 'The current password is not correct.', '#password');
  if (nw.length < 10) return back(req, res, 'error', 'The new password must be at least 10 characters.', '#password');
  if (nw !== nw2) return back(req, res, 'error', 'The new passwords do not match.', '#password');
  if (refusedPassword(nw)) return back(req, res, 'error', 'That is a published development password; choose another one.', '#password');
  if (await bcrypt.compare(nw, u.password_hash)) return back(req, res, 'error', 'Choose a password different from the current one.', '#password');
  await q('UPDATE users SET password_hash = $1, must_change_password = false, password_changed_at = now() WHERE id = $2', [await bcrypt.hash(nw, 12), u.id]);
  await q(`DELETE FROM sessions WHERE sess->>'userId' = $1 AND sid <> $2`, [u.id, req.sessionID]).catch(() => {});
  await audit({ user: u, platformId: u.platform_id, action: 'user.password_change', target: u.email });
  flash(req, 'success', 'Password changed. Other sessions were signed out.');
  res.redirect(u.role === 'super_admin' ? '/admin' : '/portal');
}));

r.post('/2fa/enable', limiter(15, 10), wrap(async (req, res) => {
  const u = await me(req); const secret = req.session.totpSetup;
  if (u.totp_enabled || !secret) return back(req, res, 'error', 'Two-factor sign-in is already set up.', '#two-factor');
  const step = totp.verify(secret, req.body.code);
  if (!step) return back(req, res, 'error', 'That code is not valid. Check the code in your authenticator app and try again.', '#two-factor');
  const codes = totp.newRecoveryCodes();
  await q('UPDATE users SET totp_secret_enc = $1, totp_enabled = true, totp_last_step = $2, recovery_hashes = $3 WHERE id = $4', [totp.encryptSecret(secret), step, codes.map(totp.hashRecovery), u.id]);
  delete req.session.totpSetup; req.session.newRecoveryCodes = codes;
  await audit({ user: u, platformId: u.platform_id, action: 'user.2fa_enable', target: u.email });
  flash(req, 'success', 'Two-factor sign-in is on. Save your recovery codes now: they are shown only once.');
  res.redirect('/account/security#two-factor');
}));

r.post('/2fa/disable', limiter(15, 10), wrap(async (req, res) => {
  const u = await me(req);
  if (!u.totp_enabled) return back(req, res, 'error', 'Two-factor sign-in is not on.', '#two-factor');
  if (!(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) return back(req, res, 'error', 'The password is not correct.', '#two-factor');
  const step = totp.verify(totp.decryptSecret(u.totp_secret_enc), req.body.code, { lastStep: u.totp_last_step });
  if (!step) return back(req, res, 'error', 'That code is not valid.', '#two-factor');
  await q('UPDATE users SET totp_secret_enc = NULL, totp_enabled = false, totp_last_step = 0, recovery_hashes = $1 WHERE id = $2', ['{}', u.id]);
  await audit({ user: u, platformId: u.platform_id, action: 'user.2fa_disable', target: u.email });
  back(req, res, 'success', 'Two-factor sign-in turned off.', '#two-factor');
}));

r.post('/2fa/recovery-codes', limiter(15, 10), wrap(async (req, res) => {
  const u = await me(req);
  if (!u.totp_enabled) return back(req, res, 'error', 'Two-factor sign-in is not on.', '#two-factor');
  if (!(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) return back(req, res, 'error', 'The password is not correct.', '#two-factor');
  const codes = totp.newRecoveryCodes();
  await q('UPDATE users SET recovery_hashes = $1 WHERE id = $2', [codes.map(totp.hashRecovery), u.id]);
  req.session.newRecoveryCodes = codes;
  await audit({ user: u, platformId: u.platform_id, action: 'user.2fa_recovery_codes', target: u.email });
  res.redirect('/account/security#two-factor');
}));

module.exports = r;
