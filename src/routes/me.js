// Individuals portal (M1), signed-in part: dashboard, credentials and claims, profile and consent, support, privacy.
// Every route checks on the server that the signed-in user is an individual and acts only on that person's own records.
const express = require('express');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const email = require('../lib/email');
const I = require('../lib/individuals');
const { requireLogin, limiter, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use(requireLogin, (req, res, next) => (req.user.role === 'individual' ? next()
  : res.status(403).render('error', { title: 'Not available', message: 'This area is for individual accounts.' })));

const fail = (req, res, e, to) => {
  if (!(e instanceof I.IndividualError)) throw e;
  if (e.status === 404 && !to) return res.status(404).render('error', { title: 'Not found', message: e.message });
  flash(req, 'error', e.message); return res.redirect(to || '/me');
};
const me = async (req) => (await q(`SELECT id, full_name, email, email_verified_at, marketing_opt_in, marketing_opt_in_at, totp_enabled, closure_requested_at, created_at FROM users WHERE id = $1`, [req.user.id])).rows[0];

r.get('/', wrap(async (req, res) => {
  const u = await me(req);
  const [linked, claimable] = [await I.linked(u.id), await I.claimable(u.id)];
  const { rows: [{ open }] } = await q(`SELECT count(*)::int AS open FROM credential_claim_requests WHERE user_id = $1 AND status = 'submitted'`, [u.id]);
  res.render('me/dashboard', { title: 'My account', u, linked, claimable, openRequests: open });
}));

r.post('/verify/resend', limiter(15, 3), wrap(async (req, res) => {
  const u = await me(req);
  if (!u.email_verified_at) {
    const token = await I.newToken(u.id, 'verify_email', u.email);
    await email.queue({ to: u.email, name: u.full_name, template: 'individual_verify', data: { name: u.full_name, token } });
  }
  flash(req, 'success', 'If your address still needs confirming, a new link is on its way.');
  res.redirect('/me');
}));

// ---------- Credentials ----------
r.get('/credentials', wrap(async (req, res) => {
  const u = await me(req);
  const { rows: requests } = await q(`SELECT id, cert_number, status, decision_reason, created_at, decided_at FROM credential_claim_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [u.id]);
  const { rows: emails } = await q(`SELECT id, email, verified_at FROM individual_emails WHERE user_id = $1 ORDER BY created_at`, [u.id]);
  const { qrToken } = require('../lib/crypto');
  const linked = (await I.linked(u.id)).map((c) => ({ ...c, pdf_t: c.is_preview ? null : qrToken(c.verification_hash) }));
  res.render('me/credentials', { title: 'My credentials', u, linked, claimable: await I.claimable(u.id), requests, emails });
}));

r.post('/credentials/claim', limiter(15, 30), wrap(async (req, res) => {
  try {
    const out = await I.claimByEmail(req.user, String(req.body.certificate_id || ''));
    flash(req, 'success', `Credential ${out.cert_number} is now in your account.`);
  } catch (e) { return fail(req, res, e, '/me/credentials'); }
  res.redirect('/me/credentials');
}));

r.post('/credentials/request', limiter(15, 10), wrap(async (req, res) => {
  try {
    await I.requestClaim(req.user, req.body);
    flash(req, 'success', 'Your request is sent. LIV staff review it and you will see the outcome here.');
  } catch (e) { return fail(req, res, e, '/me/credentials#request'); }
  res.redirect('/me/credentials');
}));

r.post('/credentials/requests/:id/withdraw', wrap(async (req, res) => {
  try { await I.withdrawRequest(req.user, req.params.id); flash(req, 'success', 'Request withdrawn.'); } catch (e) { return fail(req, res, e, '/me/credentials'); }
  res.redirect('/me/credentials');
}));

r.post('/credentials/:claimId/release', wrap(async (req, res) => {
  try { await I.release(req.user, req.params.claimId); flash(req, 'success', 'The credential is removed from your account. The credential itself is unchanged and still verifies.'); }
  catch (e) { return fail(req, res, e, '/me/credentials'); }
  res.redirect('/me/credentials');
}));

// Extra addresses: used only to find credentials recorded under an address the person used with a training provider.
r.post('/emails', limiter(15, 5), wrap(async (req, res) => {
  const addr = I.normEmail(req.body.email);
  if (!I.EMAIL_RE.test(addr)) { flash(req, 'error', 'Enter a valid email address.'); return res.redirect('/me/credentials#emails'); }
  const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM individual_emails WHERE user_id = $1', [req.user.id]);
  if (n >= 5) { flash(req, 'error', 'You can add up to 5 addresses.'); return res.redirect('/me/credentials#emails'); }
  if (addr !== I.normEmail(req.user.email)) {
    await q(`INSERT INTO individual_emails (user_id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, addr]);
    const token = await I.newToken(req.user.id, 'extra_email', addr);
    await email.queue({ to: addr, template: 'individual_extra_email', data: { token } });
    await audit({ user: req.user, action: 'individual.email_add', target: addr });
  }
  flash(req, 'success', `A confirmation link was sent to ${addr}. The address counts once you confirm it.`);
  res.redirect('/me/credentials#emails');
}));

r.get('/emails/verify', wrap(async (req, res) => {
  const t = await I.consumeToken(req.query.t, 'extra_email');
  if (!t || t.user_id !== req.user.id) { flash(req, 'error', 'This confirmation link is not valid, has expired, or belongs to another account.'); return res.redirect('/me/credentials#emails'); }
  try {
    await q(`UPDATE individual_emails SET verified_at = now() WHERE user_id = $1 AND lower(email) = $2 AND verified_at IS NULL`, [t.user_id, t.email]);
  } catch (e) {
    if (e.code !== '23505') throw e;
    flash(req, 'error', 'This address is already confirmed on another account. Contact LIV support.'); return res.redirect('/me/credentials#emails');
  }
  await audit({ user: req.user, action: 'individual.email_verified', target: t.email });
  flash(req, 'success', `${t.email} is confirmed.`);
  res.redirect('/me/credentials');
}));

r.post('/emails/:id/remove', wrap(async (req, res) => {
  const { rows: [e] } = await q('DELETE FROM individual_emails WHERE id = $1 AND user_id = $2 RETURNING email', [req.params.id, req.user.id]);
  if (!e) return res.status(404).render('error', { title: 'Not found', message: 'Not found.' });
  await audit({ user: req.user, action: 'individual.email_remove', target: e.email });
  flash(req, 'success', 'Address removed. Credentials already in your account stay linked.');
  res.redirect('/me/credentials#emails');
}));

// ---------- Profile and communication preferences ----------
r.get('/profile', wrap(async (req, res) => res.render('me/profile', { title: 'Profile and preferences', u: await me(req), errors: [] })));
r.post('/profile', wrap(async (req, res) => {
  const name = String(req.body.full_name || '').trim();
  const u = await me(req);
  const errors = [];
  if (name.length < 2 || name.length > 200) errors.push('Enter your full name (2 to 200 characters).');
  else if (I.hasNonLatin(name)) errors.push('Write your name in English (Latin letters).');
  if (errors.length) return res.status(400).render('me/profile', { title: 'Profile and preferences', u, errors });
  const marketing = req.body.marketing === 'yes';
  await q(`UPDATE users SET full_name = $1, marketing_opt_in = $2, marketing_opt_in_at = CASE WHEN $2 <> marketing_opt_in THEN now() ELSE marketing_opt_in_at END WHERE id = $3`, [name, marketing, u.id]);
  await audit({ user: req.user, action: 'individual.profile_update', target: u.email, metadata: { marketing_opt_in: marketing } });
  flash(req, 'success', 'Saved. Service messages about your account and credentials are sent whatever you choose here.');
  res.redirect('/me/profile');
}));

// ---------- Support ----------
r.get('/support', wrap(async (req, res) => {
  const { rows } = await q('SELECT topic, message, handled, created_at FROM contact_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
  res.render('me/support', { title: 'Support', rows, error: null, form: {} });
}));
r.post('/support', limiter(15, 5), wrap(async (req, res) => {
  const topic = ['account', 'credentials', 'privacy', 'billing', 'general'].includes(req.body.topic) ? req.body.topic : 'general';
  const message = String(req.body.message || '').trim();
  if (message.length < 10 || message.length > 5000) {
    const { rows } = await q('SELECT topic, message, handled, created_at FROM contact_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    return res.status(400).render('me/support', { title: 'Support', rows, error: 'Write a message of 10 to 5000 characters.', form: { topic, message } });
  }
  await q(`INSERT INTO contact_messages (name, email, topic, message, user_id) VALUES ($1,$2,$3,$4,$5)`, [req.user.full_name, req.user.email, topic, message, req.user.id]);
  flash(req, 'success', 'Your message is sent. LIV support replies by email.');
  res.redirect('/me/support');
}));

// ---------- Privacy ----------
r.get('/privacy', wrap(async (req, res) => res.render('me/privacy', { title: 'Privacy and your data', u: await me(req) })));
r.get('/privacy/export.json', limiter(15, 10), wrap(async (req, res) => {
  const data = await I.exportData(req.user.id);
  await audit({ user: req.user, action: 'individual.data_export', target: req.user.email });
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="liv-account-data.json"', 'Cache-Control': 'no-store' });
  res.send(JSON.stringify(data, null, 2));
}));
r.post('/privacy/close', limiter(15, 3), wrap(async (req, res) => {
  const u = await me(req);
  if (req.body.confirm !== 'CLOSE') { flash(req, 'error', 'Type CLOSE to confirm the request.'); return res.redirect('/me/privacy'); }
  if (!u.closure_requested_at) {
    await q('UPDATE users SET closure_requested_at = now() WHERE id = $1', [u.id]);
    await q(`INSERT INTO contact_messages (name, email, topic, message, user_id) VALUES ($1,$2,'privacy',$3,$4)`,
      [u.full_name, u.email, 'Account closure requested by the account holder. Credentials issued to this person stay valid and verifiable.', u.id]);
    await audit({ user: req.user, action: 'individual.closure_request', target: u.email });
  }
  flash(req, 'success', 'Your request to close the account is recorded. LIV support will confirm by email. Your credentials stay valid and verifiable.');
  res.redirect('/me/privacy');
}));

module.exports = r;
