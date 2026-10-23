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
  const form = { full_name: String(req.body.full_name || '').trim(), email: I.normEmail(req.body.email), marketing: req.body.marketing === 'yes', newsletter: req.body.newsletter === 'yes' };
  const errors = I.validateSignup({ ...form, password: String(req.body.password || ''), confirm: String(req.body.confirm_password || ''), terms: req.body.terms === 'yes' });
  if (!errors.length && refusedPassword(String(req.body.password))) errors.push('That is a published development password; choose another one.');
  if (errors.length) return res.status(400).render('public/signup', { title: 'Create an account', errors, form });
  const { rows: [existing] } = await q('SELECT id FROM users WHERE lower(email) = $1', [form.email]);
  if (existing) {
    await email.queue({ to: form.email, template: 'individual_exists', dedupeKey: `exists:${form.email}:${new Date().toISOString().slice(0, 10)}` });
  } else {
    const { rows: [u] } = await q(`INSERT INTO users (role, full_name, email, password_hash) VALUES ('individual',$1,$2,$3) RETURNING id, email, role`,
    [form.full_name.slice(0, 200), form.email, await bcrypt.hash(String(req.body.password), 12)]);
    // Each optional choice is recorded with its source and the exact text shown (src/lib/community.js).
    const C = require('../lib/community');
    if (form.newsletter) await C.setConsent(u.id, 'newsletter', true, 'sign-up');
    if (form.marketing) await C.setConsent(u.id, 'offers', true, 'sign-up');
    const token = await I.newToken(u.id, 'verify_email', u.email);
    await email.queue({ to: u.email, name: form.full_name, template: 'individual_verify', data: { name: form.full_name, token } });
    await audit({ user: u, action: 'individual.signup', target: u.email, metadata: { offers: form.marketing, newsletter: form.newsletter } });
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

// ---------- Public pages: individuals, membership, membership verification ----------
const M = require('../lib/memberships');
r.get('/individuals', (req, res) => res.render('public/individuals', { title: 'For individuals', description: 'Keep your LIV credentials in one account, verify and share them, and learn about optional membership.' }));
r.get('/membership', wrap(async (req, res) => res.render('public/membership', { title: 'Membership and benefits', description: 'Optional LIV membership for individuals: what it includes and what it does not.',
  plans: await M.plans({ withDrafts: cfg.membershipWaitlist }), preview: false, waitlist: cfg.membershipWaitlist, consentText: require('../lib/waitlist').CONSENT, done: req.query.joined === '1' })));
r.post('/membership/waitlist', limiter(15, 10), wrap(async (req, res, next) => {
  if (!cfg.membershipWaitlist) return next();
  const W = require('../lib/waitlist');
  try { await W.join({ ...req.body, userId: req.user && req.user.role === 'individual' ? req.user.id : null }); }
  catch (e) { if (!(e instanceof W.WaitlistError)) throw e; flash(req, 'error', e.message); return res.redirect('/membership#waitlist'); }
  res.redirect('/membership?joined=1#waitlist');
}));
r.get('/membership/waitlist/leave', (req, res) => res.render('public/waitlist-leave', { title: 'Leave the waitlist', token: String(req.query.t || ''), done: false }));
r.post('/membership/waitlist/leave', limiter(15, 20), wrap(async (req, res) => {
  const out = await require('../lib/waitlist').leave(req.body.t);
  res.status(out ? 200 : 400).render('public/waitlist-leave', { title: 'Leave the waitlist', token: '', done: Boolean(out) });
}));
r.get('/membership/verify', (req, res) => {
  const n = String(req.query.number || '').trim();
  if (n) return res.redirect(`/membership/verify/${encodeURIComponent(n.toUpperCase())}`);
  res.render('public/membership-verify', { title: 'Verify a membership', out: null });
});
r.get('/membership/verify/:number', limiter(1, 60), wrap(async (req, res) => {
  const out = await M.verifyPublic(req.params.number);
  res.set('Cache-Control', 'no-store');
  res.status(out.result === 'active' || out.result === 'not_active' ? 200 : 404).render('public/membership-verify', { title: 'Verify a membership', out });
}));

// ---------- Resources, community, unsubscribe, program interest (M3, M5) ----------
const R = require('../lib/resources');
const C = require('../lib/community');
const { renderMarkdown } = require('../lib/content');
const staffOrAccess = async (user, it) => (user && user.realRole === 'super_admin' ? { ok: true } : R.canAccess(user, it));
r.get('/resources', wrap(async (req, res) => res.render('public/resources', { title: 'Resources and products', description: 'Reviewed guides, templates and tools from LIV: free, included with membership, or sold separately.', items: await R.listPublished(), KINDS: R.KINDS, ACCESS: R.ACCESS })));
r.get('/resources/:slug', wrap(async (req, res, next) => {
  const it = await R.bySlug(req.params.slug);
  const staff = req.user && req.user.realRole === 'super_admin';
  if (!it || (it.status !== 'published' && !staff)) return next();
  const a = await staffOrAccess(req.user, it);
  res.render('public/resource', { title: it.title, description: it.summary, it, a, html: a.ok ? renderMarkdown(it.body_md || '') : '', KINDS: R.KINDS, ACCESS: R.ACCESS, preview: it.status !== 'published' });
}));
r.get('/resources/:slug/file', wrap(async (req, res, next) => {
  const it = await R.bySlug(req.params.slug);
  if (!it || !it.file_key) return next();
  const staff = req.user && req.user.realRole === 'super_admin';
  if (it.status !== 'published' && !staff) return next();
  if (!(await staffOrAccess(req.user, it)).ok) return res.status(403).render('error', { title: 'Not available', message: 'Sign in with an account that has access to this resource.' });
  const f = await require('../lib/files').getFile(it.file_key);
  if (!f) return next();
  res.attachment(it.file_name || 'resource').type(f.type).send(f.content);
}));
r.get('/community', wrap(async (req, res) => res.render('public/community', { title: 'Community and events', description: 'LIV community sessions and events.', events: await C.events() })));
r.get('/unsubscribe', (req, res) => res.render('public/unsubscribe', { title: 'Stop emails', token: String(req.query.t || ''), channel: ['newsletter', 'offers'].includes(req.query.c) ? req.query.c : 'newsletter', done: false }));
r.post('/unsubscribe', limiter(15, 20), wrap(async (req, res) => {
  const channel = ['newsletter', 'offers'].includes(req.body.c) ? req.body.c : 'newsletter';
  const u = await C.unsubscribe(req.body.t, channel);
  res.status(u ? 200 : 400).render('public/unsubscribe', { title: 'Stop emails', token: '', channel, done: Boolean(u) });
}));
r.post('/credentials/:slug/interest', limiter(15, 10), wrap(async (req, res, next) => {
  const s = await require('../lib/scheme-store').schemeBySlug(req.params.slug);
  if (!s || s.status === 'retired') return next();
  const email = I.normEmail(req.body.email);
  if (!I.EMAIL_RE.test(email)) { flash(req, 'error', 'Enter a valid email address.'); return res.redirect(`/credentials/${s.slug}`); }
  await q(`INSERT INTO program_interest (scheme_id, user_id, email) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [s.id, req.user && req.user.role === 'individual' ? req.user.id : null, email]);
  flash(req, 'success', 'Thank you. We will email you when this program opens. Nothing is reserved and nothing is charged.');
  res.redirect(`/credentials/${s.slug}`);
}));

module.exports = r;
