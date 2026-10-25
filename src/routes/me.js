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
const me = async (req) => (await q(`SELECT id, full_name, email, email_verified_at, marketing_opt_in, marketing_opt_in_at, newsletter_opt_in, newsletter_topics, totp_enabled, closure_requested_at, created_at FROM users WHERE id = $1`, [req.user.id])).rows[0];

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
r.get('/profile', wrap(async (req, res) => res.render('me/profile', { title: 'Profile and preferences', u: await me(req), errors: [], TOPICS: require('../lib/community').TOPICS, history: await require('../lib/community').consentHistory(req.user.id) })));
r.post('/profile', wrap(async (req, res) => {
  const name = String(req.body.full_name || '').trim();
  const u = await me(req);
  const errors = [];
  if (name.length < 2 || name.length > 200) errors.push('Enter your full name (2 to 200 characters).');
  else if (I.hasNonLatin(name)) errors.push('Write your name in English (Latin letters).');
  if (errors.length) return res.status(400).render('me/profile', { title: 'Profile and preferences', u, errors, TOPICS: require('../lib/community').TOPICS, history: [] });
  const marketing = req.body.marketing === 'yes'; const newsletter = req.body.newsletter === 'yes';
  const C = require('../lib/community');
  await q('UPDATE users SET full_name = $1 WHERE id = $2', [name, u.id]);
  await C.setConsent(u.id, 'offers', marketing, 'profile');
  await C.setConsent(u.id, 'newsletter', newsletter, 'profile');
  await C.setTopics(u.id, req.body.topics);
  await audit({ user: req.user, action: 'individual.profile_update', target: u.email, metadata: { offers: marketing, newsletter } });
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

// ---------- Membership (M2) ----------
const M = require('../lib/memberships');
const cfg = require('../config');
const mfail = (req, res, e, to = '/me/membership') => { if (!(e instanceof M.MembershipError)) throw e; flash(req, 'error', e.message); return res.redirect(to); };

r.get('/membership', wrap(async (req, res) => {
  const u = await me(req);
  const cur = await M.current(u.id);
  const plans = await M.plans();
  const verifyUrl = cur.active ? `${cfg.baseUrl}/membership/verify/${cur.active.member_number}` : null;
  const qr = verifyUrl ? await require('qrcode').toDataURL(verifyUrl, { margin: 1, width: 160 }) : null;
  const { rows: [{ card_show_name }] } = await q('SELECT card_show_name FROM users WHERE id = $1', [u.id]);
  res.render('me/membership', { title: 'My membership', u, cur, plans, verifyUrl, qr, cardShowName: card_show_name, salesOpen: cfg.membershipSales });
}));
r.post('/membership/join/:code', limiter(15, 10), wrap(async (req, res) => {
  try { const out = await M.join(req.user, req.params.code); flash(req, 'success', 'Your membership is waiting for payment. It starts once the invoice is paid.'); return res.redirect(`/me/billing/${out.invoiceId}`); }
  catch (e) { return mfail(req, res, e); }
}));
r.post('/membership/:id/cancel-pending', wrap(async (req, res) => {
  try { await M.cancelPending(req.user, req.params.id); flash(req, 'success', 'Cancelled. No payment is due.'); } catch (e) { return mfail(req, res, e); }
  res.redirect('/me/membership');
}));
r.post('/membership/:id/renewal', wrap(async (req, res) => {
  const declined = req.body.declined === 'yes';
  try { await M.setRenewalDeclined(req.user, req.params.id, declined); flash(req, 'success', declined ? 'Noted: you will not renew. Your membership stays active until its end date.' : 'Renewal reminders are back on.'); }
  catch (e) { return mfail(req, res, e); }
  res.redirect('/me/membership');
}));
r.post('/membership/card', wrap(async (req, res) => {
  const show = req.body.show_name === 'yes';
  await q('UPDATE users SET card_show_name = $1 WHERE id = $2', [show, req.user.id]);
  await audit({ user: req.user, action: 'membership.card_privacy', target: req.user.email, metadata: { show_name: show } });
  flash(req, 'success', show ? 'Your name now shows on the membership verification page.' : 'Your name is hidden on the membership verification page.');
  res.redirect('/me/membership#card');
}));

// ---------- Orders and billing ----------
const ownInvoice = async (req) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return null;
  const { rows: [inv] } = await q('SELECT * FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!inv) return null;
  const [lines, payments] = await Promise.all([q('SELECT * FROM invoice_lines WHERE invoice_id = $1', [inv.id]), q('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY created_at', [inv.id])]);
  return { inv, lines: lines.rows, payments: payments.rows };
};
r.get('/billing', wrap(async (req, res) => {
  const { rows } = await q(`SELECT id, number, status, issue_date, total_cents, amount_paid_cents, currency FROM invoices WHERE user_id = $1 AND status <> 'draft' ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
  res.render('me/billing', { title: 'Orders and billing', rows, money: require('../lib/billing').money });
}));
r.get('/billing/:id', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d) return next();
  res.render('me/invoice', { title: `Invoice ${d.inv.number || ''}`, ...d, money: require('../lib/billing').money, cardPay: Boolean(cfg.stripeSecretKey), paidReturn: req.query.paid === '1' });
}));
r.post('/billing/:id/pay', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d) return next();
  const back = `/me/billing/${d.inv.id}`;
  const balance = Number(d.inv.total_cents) - Number(d.inv.amount_paid_cents);
  if (!cfg.stripeSecretKey) { flash(req, 'error', 'Card payment is not available yet. Contact LIV support for payment instructions.'); return res.redirect(back); }
  if (d.inv.status !== 'open' || balance <= 0) { flash(req, 'error', 'This invoice is not open for payment.'); return res.redirect(back); }
  try {
    const s = await require('../lib/stripe').createCheckoutSession({ secretKey: cfg.stripeSecretKey, invoice: d.inv, balanceCents: balance, customerEmail: req.user.email, baseUrl: cfg.baseUrl, returnPath: back });
    await audit({ user: req.user, action: 'billing.checkout_started', target: d.inv.id, metadata: { session: s.id } });
    return res.redirect(303, s.url);
  } catch (e) { console.error('Stripe checkout failed:', e.message); flash(req, 'error', 'Card payment could not be started. Please try again later.'); return res.redirect(back); }
}));
r.get('/billing/:id/pdf', wrap(async (req, res, next) => {
  const d = await ownInvoice(req); if (!d || d.inv.status === 'draft') return next();
  const pdf = await require('../lib/invoice-pdf').renderInvoice(d.inv, d.lines, d.payments);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.inv.number}.pdf"` }).send(pdf);
}));

// ---------- Library and purchases (M3) ----------
const R = require('../lib/resources');
const C = require('../lib/community');
const G = require('../lib/gifts');
const back = (req, res, to, e, Err) => { if (!(e instanceof Err)) throw e; flash(req, 'error', e.message); return res.redirect(to); };

r.get('/library', wrap(async (req, res) => {
  const items = await R.listPublished();
  const access = {}; for (const it of items) access[it.id] = await R.canAccess(req.user, it);
  res.render('me/library', { title: 'Library and purchases', items, access, purchases: await R.library(req.user.id), member: await R.activeMember(req.user.id), KINDS: R.KINDS, ACCESS: R.ACCESS });
}));
r.post('/library/:slug/buy', limiter(15, 10), wrap(async (req, res) => {
  try { const out = await R.buy(req.user, req.params.slug); flash(req, 'success', 'Your order is waiting for payment. Access starts once the invoice is paid.'); return res.redirect(`/me/billing/${out.invoiceId}`); }
  catch (e) { return back(req, res, '/me/library', e, R.ResourceError); }
}));

// ---------- Events and contributions (M3) ----------
r.get('/events', wrap(async (req, res) => {
  const mine = await C.myEvents(req.user.id);
  res.render('me/events', { title: 'Events and contributions', events: await C.events(), mine, mineIds: new Set(mine.map((e) => e.id)), member: await R.activeMember(req.user.id),
    contributions: (await q('SELECT * FROM contributions WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id])).rows, KINDS: C.KINDS });
}));
r.post('/events/:id/register', limiter(15, 20), wrap(async (req, res) => {
  try { await C.register(req.user, req.params.id); flash(req, 'success', 'You are registered. The joining details are shown on this page.'); } catch (e) { return back(req, res, '/me/events', e, C.CommunityError); }
  res.redirect('/me/events');
}));
r.post('/events/:id/cancel', wrap(async (req, res) => {
  try { await C.cancelRegistration(req.user, req.params.id); flash(req, 'success', 'Registration cancelled.'); } catch (e) { return back(req, res, '/me/events', e, C.CommunityError); }
  res.redirect('/me/events');
}));
r.post('/contributions', limiter(15, 5), wrap(async (req, res) => {
  try { await C.contribute(req.user, req.body); flash(req, 'success', 'Your proposal is sent. LIV reviews it before anything is published.'); } catch (e) { return back(req, res, '/me/events#contribute', e, C.CommunityError); }
  res.redirect('/me/events#contribute');
}));
r.post('/contributions/:id/withdraw', wrap(async (req, res) => {
  await q(`UPDATE contributions SET status = 'withdrawn' WHERE id = $1 AND user_id = $2 AND status = 'submitted'`, [req.params.id, req.user.id]);
  res.redirect('/me/events#contribute');
}));

// ---------- LIV Expert Network ----------
r.get('/expert', wrap(async (req, res) => {
  res.render('me/expert', { title: 'Expert network', TRACKS: C.TRACKS, PRIVACY: C.EXPERT_PRIVACY_TEXT,
    apps: (await q('SELECT * FROM expert_applications WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id])).rows });
}));
r.post('/expert', limiter(15, 5), wrap(async (req, res) => {
  try { await C.applyExpert(req.user, req.body); flash(req, 'success', 'Your application is sent. LIV staff review it and reply here.'); } catch (e) { return back(req, res, '/me/expert', e, C.CommunityError); }
  res.redirect('/me/expert');
}));
r.post('/expert/:id/withdraw', wrap(async (req, res) => {
  await q(`UPDATE expert_applications SET status = 'withdrawn' WHERE id = $1 AND user_id = $2 AND status IN ('submitted','approved')`, [req.params.id, req.user.id]);
  res.redirect('/me/expert');
}));

// ---------- Gifts and group packs (M4) ----------
r.get('/gifts', wrap(async (req, res) => {
  res.render('me/gifts', { title: 'Gifts and group memberships', plans: await M.plans(), bought: await G.giftsBought(req.user.id), packs: await G.packsManaged(req.user.id) });
}));
r.post('/gifts/redeem', limiter(15, 10), wrap(async (req, res) => {
  try { const out = await G.redeem(req.user, req.body.code); flash(req, 'success', out.kind === 'seat' ? 'Invitation accepted. Your membership is active.' : 'Gift accepted. Your membership is active; it does not renew automatically.'); return res.redirect('/me/membership'); }
  catch (e) { return back(req, res, '/me/gifts', e, G.GiftError); }
}));
r.post('/gifts/buy', limiter(15, 10), wrap(async (req, res) => {
  try { const out = await G.buyGift(req.user, req.body); flash(req, 'success', 'Your gift is waiting for payment. The recipient gets the code once it is paid.'); return res.redirect(`/me/billing/${out.invoiceId}`); }
  catch (e) { return back(req, res, '/me/gifts#give', e, G.GiftError); }
}));
r.post('/gifts/:id/resend', limiter(15, 5), wrap(async (req, res) => {
  try { await G.resendGift(req.user, req.params.id); flash(req, 'success', 'Sent again with a new code. The previous code no longer works.'); } catch (e) { return back(req, res, '/me/gifts', e, G.GiftError); }
  res.redirect('/me/gifts');
}));
r.post('/groups', limiter(15, 10), wrap(async (req, res) => {
  try { const out = await G.buyPack(req.user, req.body); flash(req, 'success', 'Your group pack is waiting for payment. You can invite people once it is paid.'); return res.redirect(`/me/billing/${out.invoiceId}`); }
  catch (e) { return back(req, res, '/me/gifts#group', e, G.GiftError); }
}));
r.get('/groups/:id', wrap(async (req, res, next) => {
  const pk = await G.ownPack(req.user, req.params.id); if (!pk) return next();
  res.render('me/group', { title: `Group pack: ${pk.org_name}`, pk, seats: await G.seats(pk.id), newCode: req.session.newSeatCode || null });
  delete req.session.newSeatCode;
}));
r.post('/groups/:id/invite', limiter(15, 60), wrap(async (req, res, next) => {
  const pk = await G.ownPack(req.user, req.params.id); if (!pk) return next();
  try { const code = await G.invite(req.user, pk.id, req.body); req.session.newSeatCode = { email: String(req.body.email).trim().toLowerCase(), code }; flash(req, 'success', 'Invitation sent.'); }
  catch (e) { return back(req, res, `/me/groups/${pk.id}`, e, G.GiftError); }
  res.redirect(`/me/groups/${pk.id}`);
}));
r.post('/groups/:id/seats/:seat/revoke', wrap(async (req, res, next) => {
  const pk = await G.ownPack(req.user, req.params.id); if (!pk) return next();
  try { await G.revokeSeat(req.user, pk.id, req.params.seat); flash(req, 'success', 'Seat withdrawn. It can be given to someone else. The person keeps their own account and credentials.'); }
  catch (e) { return back(req, res, `/me/groups/${pk.id}`, e, G.GiftError); }
  res.redirect(`/me/groups/${pk.id}`);
}));

module.exports = r;
