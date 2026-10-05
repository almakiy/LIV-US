// Billing administration (super admin): price catalog, partner plans and discounts, invoices and payments, exports. See docs/BILLING.md.
const express = require('express');
const { q } = require('../db');
const { audit } = require('../lib/audit');
const billing = require('../lib/billing');
const store = require('../lib/billing-store');
const { renderInvoice } = require('../lib/invoice-pdf');
const { toCsv } = require('../lib/qms');
const { PLANS, DISCOUNT_CATEGORIES } = require('../lib/billing-catalog');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
r.use(requireSuper);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const idParam = (req, res, next) => (UUID_RE.test(req.params.id) ? next() : next('route'));
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const toCents = (v) => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const go = (req, res, to, type, text) => { if (text) flash(req, type, text); res.redirect(to); };
const loadPlatform = async (id) => (await q('SELECT * FROM platforms WHERE id = $1', [id])).rows[0];

r.get('/', wrap(async (req, res) => {
  const { rows: [t] } = await q(`SELECT count(*) FILTER (WHERE status='open')::int AS open, COALESCE(sum(total_cents - amount_paid_cents) FILTER (WHERE status='open'), 0)::bigint AS outstanding,
      count(*) FILTER (WHERE status='open' AND due_date < CURRENT_DATE)::int AS overdue, COALESCE(sum(total_cents - amount_paid_cents) FILTER (WHERE status='open' AND due_date < CURRENT_DATE), 0)::bigint AS overdue_amount,
      count(*) FILTER (WHERE status='draft')::int AS drafts, COALESCE(sum(amount_paid_cents) FILTER (WHERE status IN ('open','paid') AND date_trunc('year', issue_date) = date_trunc('year', CURRENT_DATE)), 0)::bigint AS collected_year FROM invoices`);
  const { rows: months } = await q(`SELECT to_char(received_on, 'YYYY-MM') AS month, sum(amount_cents)::bigint AS cents FROM payments GROUP BY 1 ORDER BY 1 DESC LIMIT 12`);
  const { rows: late } = await q(`SELECT i.id, i.number, i.due_date, i.total_cents - i.amount_paid_cents AS balance, p.company_name FROM invoices i JOIN platforms p ON p.id = i.platform_id WHERE i.status = 'open' AND i.due_date < CURRENT_DATE ORDER BY i.due_date LIMIT 20`);
  res.render('admin/billing/index', { title: 'Billing', t, months, late, money: billing.money });
}));

// ---------- Price catalog ----------
r.get('/catalog', wrap(async (req, res) => {
  const { rows: products } = await q('SELECT * FROM billing_products ORDER BY sort, code');
  const { rows: prices } = await q(`SELECT * FROM billing_prices WHERE valid_to IS NULL OR valid_to >= CURRENT_DATE ORDER BY plan NULLS FIRST, min_qty`);
  res.render('admin/billing/catalog', { title: 'Price catalog', products, prices, money: billing.money, PLANS });
}));
r.post('/catalog/products/:id/active', idParam, wrap(async (req, res) => {
  const { rows: [p] } = await q('UPDATE billing_products SET active = NOT active WHERE id = $1 RETURNING code, active', [req.params.id]);
  if (p) await audit({ user: req.user, action: 'billing.product.toggle', target: `${p.code} ${p.active ? 'active' : 'inactive'}` });
  go(req, res, '/admin/billing/catalog');
}));
r.post('/catalog/prices/:id', idParam, wrap(async (req, res) => {
  const cents = toCents(req.body.amount);
  if (cents == null) return go(req, res, '/admin/billing/catalog', 'error', 'Enter a valid amount in dollars.');
  const { rows: [old] } = await q('SELECT pr.*, p.code FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE pr.id = $1', [req.params.id]);
  if (!old) return go(req, res, '/admin/billing/catalog');
  if (old.unit_amount_cents === cents) return go(req, res, '/admin/billing/catalog');
  // History is kept: the old row ends yesterday and the new price starts today.
  await q(`UPDATE billing_prices SET valid_to = CURRENT_DATE - 1 WHERE id = $1`, [old.id]);
  await q(`INSERT INTO billing_prices (product_id, plan, min_qty, unit_amount_cents, valid_from, created_by) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5)`, [old.product_id, old.plan, old.min_qty, cents, req.user.id]);
  await audit({ user: req.user, action: 'billing.price.change', target: `${old.code}${old.plan ? ' ' + old.plan : ''} ${billing.money(old.unit_amount_cents)} -> ${billing.money(cents)}` });
  go(req, res, '/admin/billing/catalog', 'success', 'Price updated. Existing invoices are unchanged.');
}));

// ---------- Partners: plan, hold, discounts, usage, new invoice ----------
r.get('/partners', wrap(async (req, res) => {
  const { rows } = await q(`SELECT p.id, p.company_name, p.plan, p.plan_renews_on, p.service_hold, p.accreditation_status,
      COALESCE((SELECT sum(total_cents - amount_paid_cents) FROM invoices i WHERE i.platform_id = p.id AND i.status = 'open'), 0)::bigint AS owed,
      (SELECT count(*)::int FROM invoices i WHERE i.platform_id = p.id AND i.status = 'open' AND i.due_date < CURRENT_DATE) AS overdue
    FROM platforms p ORDER BY p.company_name`);
  res.render('admin/billing/partners', { title: 'Partner billing', rows, money: billing.money, PLANS });
}));
r.get('/partners/:id', idParam, wrap(async (req, res, next) => {
  const p = await loadPlatform(req.params.id); if (!p) return next();
  const usage = await store.usageSummary(p);
  const { rows: invoices } = await q('SELECT * FROM invoices WHERE platform_id = $1 ORDER BY created_at DESC LIMIT 50', [p.id]);
  const { rows: discounts } = await q('SELECT * FROM billing_discounts WHERE platform_id = $1 ORDER BY created_at DESC', [p.id]);
  const { rows: products } = await q(`SELECT code, name, unit FROM billing_products WHERE active ORDER BY sort`);
  res.render('admin/billing/partner', { title: `Billing: ${p.company_name}`, p, usage, invoices, discounts, products, money: billing.money, PLANS, DISCOUNT_CATEGORIES, error: null });
}));
r.post('/partners/:id/plan', idParam, wrap(async (req, res) => {
  const plan = PLANS[req.body.plan] ? req.body.plan : null;
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  const inc = req.body.included_certificates === '' ? null : parseInt(req.body.included_certificates, 10);
  const tax = Math.round(Number(req.body.tax_rate) * 100);
  if (!Number.isFinite(tax) || tax < 0 || tax > 10000) return go(req, res, `/admin/billing/partners/${req.params.id}`, 'error', 'Tax rate must be between 0 and 100 percent.');
  await q(`UPDATE platforms SET plan=$1, plan_started_on=$2, plan_renews_on=$3, included_certificates=$4, tax_rate_bps=$5, tax_label=$6 WHERE id=$7`,
    [plan, date(req.body.plan_started_on), date(req.body.plan_renews_on), Number.isInteger(inc) && inc >= 0 ? inc : null, tax, str(req.body.tax_label, 20) || 'VAT', req.params.id]);
  await audit({ user: req.user, platformId: req.params.id, action: 'billing.plan.set', target: plan || 'none' });
  go(req, res, `/admin/billing/partners/${req.params.id}`, 'success', 'Plan and tax settings saved.');
}));
r.post('/partners/:id/hold', idParam, wrap(async (req, res) => {
  const { rows: [p] } = await q('UPDATE platforms SET service_hold = NOT service_hold WHERE id = $1 RETURNING company_name, service_hold', [req.params.id]);
  if (p) await audit({ user: req.user, platformId: req.params.id, action: p.service_hold ? 'billing.hold.on' : 'billing.hold.off', target: p.company_name });
  go(req, res, `/admin/billing/partners/${req.params.id}`, 'success', p && p.service_hold ? 'Service hold on: new certificates cannot be issued. Accreditation status is unchanged.' : 'Service hold lifted.');
}));
r.post('/partners/:id/discounts', idParam, wrap(async (req, res) => {
  const percent = req.body.kind === 'percent'; const val = Number(req.body.value);
  if (!DISCOUNT_CATEGORIES[req.body.category] || !Number.isFinite(val) || val <= 0 || (percent && val > 100)) return go(req, res, `/admin/billing/partners/${req.params.id}`, 'error', 'Choose a category and a valid value (percent 1-100, or a dollar credit).');
  const note = str(req.body.note, 300); if (!note) return go(req, res, `/admin/billing/partners/${req.params.id}`, 'error', 'Record the reason for the discount.');
  await q(`INSERT INTO billing_discounts (platform_id, category, product_code, percent_bps, amount_cents, note, valid_until, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.params.id, req.body.category, str(req.body.product_code, 40) || null, percent ? Math.round(val * 100) : null, percent ? null : Math.round(val * 100), note, /^\d{4}-\d{2}-\d{2}$/.test(req.body.valid_until || '') ? req.body.valid_until : null, req.user.id]);
  await audit({ user: req.user, platformId: req.params.id, action: 'billing.discount.add', target: `${req.body.category} ${percent ? val + '%' : '$' + val}` });
  go(req, res, `/admin/billing/partners/${req.params.id}`, 'success', 'Discount recorded.');
}));
r.post('/discounts/:id/delete', idParam, wrap(async (req, res) => {
  const { rows: [d] } = await q('DELETE FROM billing_discounts WHERE id = $1 AND used_invoice_id IS NULL RETURNING platform_id, category', [req.params.id]);
  if (d) await audit({ user: req.user, platformId: d.platform_id, action: 'billing.discount.remove', target: d.category });
  go(req, res, d ? `/admin/billing/partners/${d.platform_id}` : '/admin/billing/partners', d ? 'success' : 'error', d ? 'Discount removed.' : 'A discount already used on an invoice cannot be removed.');
}));

// ---------- Invoices ----------
r.post('/partners/:id/invoices', idParam, wrap(async (req, res) => {
  const p = await loadPlatform(req.params.id); if (!p) return go(req, res, '/admin/billing/partners');
  const codes = [].concat(req.body.code || []); const qtys = [].concat(req.body.qty || []);
  const items = codes.map((code, i) => ({ code, qty: qtys[i] })).filter((x) => x.code);
  try {
    const id = await store.createDraft(p, { items, includeUsage: req.body.include_usage === 'on', notes: req.body.notes, createdBy: req.user.id });
    await audit({ user: req.user, platformId: p.id, action: 'billing.invoice.draft', target: p.company_name });
    go(req, res, `/admin/billing/invoices/${id}`, 'success', 'Draft created. Review it, then issue it.');
  } catch (e) { go(req, res, `/admin/billing/partners/${p.id}`, 'error', e.message); }
}));
r.get('/invoices', wrap(async (req, res) => {
  const status = ['draft', 'open', 'paid', 'void', 'overdue'].includes(req.query.status) ? req.query.status : '';
  const { rows } = await q(`SELECT i.*, p.company_name FROM invoices i JOIN platforms p ON p.id = i.platform_id
    WHERE ($1 = '' OR (CASE WHEN $1 = 'overdue' THEN i.status = 'open' AND i.due_date < CURRENT_DATE ELSE i.status = $1 END)) ORDER BY i.created_at DESC LIMIT 300`, [status]);
  res.render('admin/billing/invoices', { title: 'Invoices', rows, status, money: billing.money, isOverdue: billing.isOverdue });
}));
async function loadInvoice(id) {
  const { rows: [inv] } = await q('SELECT i.*, p.company_name FROM invoices i JOIN platforms p ON p.id = i.platform_id WHERE i.id = $1', [id]);
  if (!inv) return null;
  const { rows: lines } = await q('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY description', [id]);
  const { rows: payments } = await q('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY received_on, created_at', [id]);
  return { inv, lines, payments };
}
r.get('/invoices/:id', idParam, wrap(async (req, res, next) => {
  const d = await loadInvoice(req.params.id); if (!d) return next();
  res.render('admin/billing/invoice', { title: d.inv.number || 'Draft invoice', ...d, money: billing.money, isOverdue: billing.isOverdue, today: billing.iso(new Date()) });
}));
r.get('/invoices/:id/pdf', idParam, wrap(async (req, res, next) => {
  const d = await loadInvoice(req.params.id); if (!d) return next();
  const pdf = await renderInvoice(d.inv, d.lines, d.payments);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.inv.number || 'draft-invoice'}.pdf"` }).send(pdf);
}));
r.post('/invoices/:id/issue', idParam, wrap(async (req, res) => {
  try {
    const out = await store.issueInvoice(req.params.id, { dueDays: Math.min(90, Math.max(0, parseInt(req.body.due_days, 10) || 14)) });
    await audit({ user: req.user, action: 'billing.invoice.issue', target: out.number });
    go(req, res, `/admin/billing/invoices/${req.params.id}`, 'success', `Invoice ${out.number} issued${out.paid ? ' (nothing to pay)' : ''}. Send the PDF to the partner or let them download it in the portal.`);
  } catch (e) { go(req, res, `/admin/billing/invoices/${req.params.id}`, 'error', e.message); }
}));
r.post('/invoices/:id/payments', idParam, wrap(async (req, res) => {
  const cents = toCents(req.body.amount);
  try {
    if (cents == null || cents === 0) throw new Error('Enter the amount received in dollars.');
    if (!['bank_transfer', 'card', 'cash', 'other'].includes(req.body.method)) throw new Error('Choose how it was paid.');
    const out = await store.recordPayment(req.params.id, { amount_cents: cents, method: req.body.method, reference: req.body.reference, received_on: /^\d{4}-\d{2}-\d{2}$/.test(req.body.received_on || '') ? req.body.received_on : billing.iso(new Date()), userId: req.user.id });
    await audit({ user: req.user, action: 'billing.payment.record', target: req.params.id, metadata: { cents, method: req.body.method } });
    go(req, res, `/admin/billing/invoices/${req.params.id}`, 'success', out.status === 'paid' ? 'Payment recorded. The invoice is paid.' : 'Partial payment recorded.');
  } catch (e) { go(req, res, `/admin/billing/invoices/${req.params.id}`, 'error', e.message); }
}));
r.post('/invoices/:id/void', idParam, wrap(async (req, res) => {
  try {
    const what = await store.discardInvoice(req.params.id);
    await audit({ user: req.user, action: `billing.invoice.${what}`, target: req.params.id });
    go(req, res, what === 'deleted' ? '/admin/billing/invoices' : `/admin/billing/invoices/${req.params.id}`, 'success', what === 'deleted' ? 'Draft deleted.' : 'Invoice voided. Its number stays on record.');
  } catch (e) { go(req, res, `/admin/billing/invoices/${req.params.id}`, 'error', e.message); }
}));

// ---------- Exports for the accountant ----------
r.get('/export/:type.csv', wrap(async (req, res, next) => {
  const sets = {
    invoices: `SELECT i.number, p.company_name, i.status, i.issue_date, i.due_date, i.currency, i.subtotal_cents, i.discount_cents, i.tax_label, i.tax_rate_bps, i.tax_cents, i.total_cents, i.amount_paid_cents, i.paid_at, i.voided_at FROM invoices i JOIN platforms p ON p.id = i.platform_id ORDER BY i.created_at`,
    lines: `SELECT i.number, l.product_code, l.description, l.quantity, l.unit_amount_cents, l.amount_cents, l.discount_cents FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE i.status <> 'draft' ORDER BY i.number, l.description`,
    payments: `SELECT i.number, p.company_name, y.amount_cents, y.method, y.provider, y.provider_payment_id, y.reference, y.received_on FROM payments y JOIN invoices i ON i.id = y.invoice_id JOIN platforms p ON p.id = i.platform_id ORDER BY y.received_on`,
  };
  if (!sets[req.params.type]) return next();
  const { rows, fields } = await q(sets[req.params.type]);
  await audit({ user: req.user, action: 'billing.export', target: req.params.type });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="liv-${req.params.type}.csv"` }).send(toCsv(rows, fields.map((f) => f.name)));
}));

module.exports = r;
