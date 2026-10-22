// Admin > Memberships (Individuals portal M2). Staff draft plans and record payments; only the main account approves terms
// and puts a plan on sale. Mounted under /admin.
const express = require('express');
const cfg = require('../config');
const { q } = require('../db');
const M = require('../lib/memberships');
const { isMainAccount } = require('../lib/exceptions');
const { recordPayment } = require('../lib/billing-store');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use('/memberships', requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const act = (fn) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const msg = await fn(req); flash(req, 'success', msg); }
  catch (e) { if (!(e instanceof M.MembershipError) && !/^(Enter|Payments|The payment|Invoice)/.test(e.message)) throw e; flash(req, 'error', e.message); }
  res.redirect(req.get('x-back') || '/admin/memberships');
});

r.get('/memberships', wrap(async (req, res) => {
  const { rows: members } = await q(`SELECT m.id, m.member_number, m.status, m.source, m.starts_on, m.ends_on, m.is_preview, m.renewal_declined_at, m.terms->>'plan_name' AS plan, u.full_name, u.email,
      i.id AS invoice_id, i.number AS invoice_number, i.total_cents, i.amount_paid_cents
    FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN invoices i ON i.id = m.invoice_id WHERE m.status <> 'void' ORDER BY m.created_at DESC LIMIT 200`);
  res.render('admin/memberships', { title: 'Memberships', plans: await M.plans({ withDrafts: true }), members, stats: await M.stats(), isMain: await isMainAccount(req.user),
    salesOpen: cfg.membershipSales, benefitsText: M.benefitsText, money: require('../lib/billing').money });
}));
r.get('/memberships/preview', wrap(async (req, res) => res.render('public/membership', { title: 'Membership and benefits (preview)', plans: await M.plans({ withDrafts: true }), preview: true })));
r.post('/memberships/plans/:id/draft', act(async (req) => { await M.saveDraft(req.user, req.params.id, req.body); return 'Draft saved. It is not shown to anyone until approved.'; }));
r.post('/memberships/plans/:id/approve', act(async (req) => { await M.approve(req.user, req.params.id); return 'Terms approved. Members keep the terms they took; new purchases use these.'; }));
r.post('/memberships/plans/:id/sale', act(async (req) => { const on = req.body.on === 'yes'; await M.setSale(req.user, req.params.id, on); return on ? 'The plan is on sale.' : 'The plan is withdrawn from sale. Current members are not affected.'; }));
r.post('/memberships/:id/suspend', act(async (req) => { await M.suspend(req.user, req.params.id, req.body.reason, req.body.on !== 'no'); return req.body.on === 'no' ? 'Membership reinstated.' : 'Membership suspended. Credentials are not affected.'; }));
r.post('/memberships/invoices/:id/payment', act(async (req) => {
  const amount = Math.round(Number(String(req.body.amount || '').trim()) * 100);
  const method = ['bank_transfer', 'card', 'cash', 'other'].includes(req.body.method) ? req.body.method : 'other';
  const { rows: [inv] } = await q('SELECT id FROM invoices WHERE id = $1 AND user_id IS NOT NULL', [req.params.id]);
  if (!inv) throw new M.MembershipError('Invoice not found.');
  await recordPayment(inv.id, { amount_cents: amount, method, reference: String(req.body.reference || '').slice(0, 200), userId: req.user.id });
  return 'Payment recorded. A fully paid membership invoice activates the membership.';
}));

module.exports = r;
