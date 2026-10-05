const test = require('node:test');
const assert = require('node:assert');
const b = require('../../src/lib/billing');
const { CATALOG, PLAN_DEFAULTS } = require('../../src/lib/billing-catalog');
const stripe = require('../../src/lib/stripe');

const bands = [{ min_qty: 1, cents: 400 }, { min_qty: 1001, cents: 300 }, { min_qty: 5001, cents: 200 }];

test('graduated pricing matches the fee-schedule examples', () => {
  assert.strictEqual(b.graduatedAmount(0, 100, bands), 40000);          // Starter, 200 certs: 100 beyond the allowance
  assert.strictEqual(b.graduatedAmount(0, 700, bands), 280000);         // Professional, 1,200 certs: 700 beyond
  assert.strictEqual(b.graduatedAmount(0, 6000, bands), 1800000);       // Enterprise, 8,000 certs: 6,000 beyond = $18,000
  assert.strictEqual(b.graduatedAmount(990, 20, bands), 10 * 400 + 10 * 300, 'a batch that crosses a band edge is split');
  assert.strictEqual(b.graduatedAmount(0, 0, bands), 0);
  assert.strictEqual(b.graduatedAmount(0, 5, []), 0);
});

test('incremental billing never charges a certificate twice and never skips one', () => {
  const included = 100; let billed = 0; let total = 0;
  for (const issued of [60, 150, 150, 1400, 6200]) {
    const u = b.usageLine({ issued, included, billedBeyond: billed, bands });
    total += u.amount_cents; billed += u.quantity;
  }
  assert.strictEqual(billed, 6100);
  assert.strictEqual(total, b.graduatedAmount(0, 6100, bands), 'sum of incremental invoices equals one invoice for the whole year');
  assert.strictEqual(b.usageLine({ issued: 80, included: 100, billedBeyond: 0, bands }).quantity, 0, 'inside the allowance nothing is billed');
});

test('bands pick plan-specific prices and respect validity dates', () => {
  const rows = [
    { plan: 'starter', min_qty: 1, unit_amount_cents: 90000, valid_from: '2026-01-01', valid_to: '2026-12-31' },
    { plan: 'starter', min_qty: 1, unit_amount_cents: 95000, valid_from: '2027-01-01', valid_to: null },
    { plan: null, min_qty: 1, unit_amount_cents: 12345, valid_from: '2026-01-01', valid_to: null },
  ];
  assert.strictEqual(b.unitPrice(b.bandsFor(rows, 'starter', '2026-06-01')), 90000);
  assert.strictEqual(b.unitPrice(b.bandsFor(rows, 'starter', '2027-06-01')), 95000);
  assert.strictEqual(b.unitPrice(b.bandsFor(rows, 'professional', '2026-06-01')), 12345, 'falls back to the plan-less price');
  assert.strictEqual(b.unitPrice(b.bandsFor(rows, null, '2025-06-01')), null, 'no price before it is valid');
});

test('the seeded catalog reproduces the illustration in FEES.md', () => {
  const price = (code, plan) => b.unitPrice(b.bandsFor(CATALOG.find((p) => p.code === code).prices.map((x) => ({ plan: x.plan, min_qty: x.min_qty, unit_amount_cents: x.cents, valid_from: '2026-01-01' })), plan, '2026-10-05'));
  assert.deepStrictEqual(['starter', 'professional', 'enterprise'].map((p) => price('ACC_APPLICATION', p)), [50000, 100000, 200000]);
  assert.deepStrictEqual(['starter', 'professional', 'enterprise'].map((p) => price('ACC_ANNUAL', p)), [90000, 240000, 600000]);
  assert.deepStrictEqual(Object.values(PLAN_DEFAULTS).map((x) => x.included), [100, 500, 2000]);
  const year1 = (plan, certs) => price('ACC_APPLICATION', plan) + price('ACC_ANNUAL', plan) + b.graduatedAmount(0, Math.max(0, certs - PLAN_DEFAULTS[plan].included), bands);
  assert.strictEqual(year1('starter', 200), 180000);
  assert.strictEqual(year1('professional', 1200), 620000);
  assert.strictEqual(year1('enterprise', 8000), 2600000);
  assert.strictEqual(new Set(CATALOG.map((p) => p.code)).size, CATALOG.length);
});

test('plan year follows the renewal date and rolls forward', () => {
  assert.deepStrictEqual(b.planYear({ plan_renews_on: '2027-03-01' }, new Date('2026-10-05')), { start: '2026-03-01', end: '2027-03-01' });
  assert.deepStrictEqual(b.planYear({ plan_renews_on: '2026-03-01' }, new Date('2026-10-05')), { start: '2026-03-01', end: '2027-03-01' });
  assert.deepStrictEqual(b.planYear({}, new Date('2026-10-05')), { start: '2026-01-01', end: '2027-01-01' });
  assert.strictEqual(b.includedFor({ plan: 'professional' }), 500);
  assert.strictEqual(b.includedFor({ plan: 'professional', included_certificates: 800 }), 800);
  assert.strictEqual(b.includedFor({}), 0);
});

test('discounts: percent per product, capped, one-off credits applied once; totals and tax round half-up', () => {
  const lines = [{ product_code: 'ACC_APPLICATION', amount_cents: 50000 }, { product_code: 'ACC_ANNUAL', amount_cents: 90000 }];
  const ds = [
    { id: 'a', percent_bps: 5000, product_code: 'ACC_APPLICATION' },
    { id: 'b', percent_bps: 5000, product_code: 'ACC_ANNUAL' },
    { id: 'c', amount_cents: 20000 },
    { id: 'd', percent_bps: 5000, product_code: 'ACC_ANNUAL', used_invoice_id: 'x' },
    { id: 'e', percent_bps: 5000, valid_until: '2020-01-01' },
  ];
  const r = b.applyDiscounts(lines, ds, new Date('2026-10-05'));
  assert.deepStrictEqual(r.lines.map((l) => l.discount_cents), [25000, 45000]);
  assert.deepStrictEqual(r.credits, [{ id: 'c', cents: 20000 }]);
  const t = b.totals(r.lines, r.credit_cents, 500);
  assert.deepStrictEqual(t, { subtotal_cents: 140000, discount_cents: 90000, tax_cents: 2500, total_cents: 52500 });
  assert.strictEqual(b.totals([{ amount_cents: 1001, discount_cents: 0 }], 0, 500).tax_cents, 50, '50.05 rounds to 50');
  assert.strictEqual(b.totals([{ amount_cents: 1010, discount_cents: 0 }], 0, 500).tax_cents, 51, '50.5 rounds up');
  const big = b.applyDiscounts([{ product_code: 'X', amount_cents: 1000 }], [{ id: 'f', amount_cents: 99999 }], new Date());
  assert.strictEqual(big.credit_cents, 1000, 'a credit never exceeds what is owed');
  assert.strictEqual(b.applyDiscounts([{ product_code: 'X', amount_cents: 1000 }], [{ id: 'g', percent_bps: 8000 }, { id: 'h', percent_bps: 8000 }], new Date()).lines[0].discount_cents, 1000, 'percent discounts cap at 100%');
});

test('payments, overdue, numbering and money formatting', () => {
  assert.deepStrictEqual(b.afterPayment(10000, 0, 4000), { amount_paid_cents: 4000, status: 'open' });
  assert.deepStrictEqual(b.afterPayment(10000, 4000, 6000), { amount_paid_cents: 10000, status: 'paid' });
  assert.strictEqual(b.isOverdue({ status: 'open', due_date: '2026-10-01' }, new Date('2026-10-05')), true);
  assert.strictEqual(b.isOverdue({ status: 'paid', due_date: '2026-10-01' }, new Date('2026-10-05')), false);
  assert.strictEqual(b.formatInvoiceNumber(2026, 7), 'INV-2026-0007');
  assert.strictEqual(b.money(123456), '$1,234.56');
  assert.strictEqual(b.addDaysISO('2026-10-05', 14), '2026-10-19');
});

test('Stripe webhook signature: valid, wrong secret, tampered body, stale timestamp', () => {
  const secret = 'whsec_test'; const body = JSON.stringify({ id: 'evt_1' }); const now = 1_800_000_000;
  const h = stripe.signHeader(body, secret, now);
  assert.strictEqual(stripe.verifySignature(body, h, secret, { now }), true);
  assert.strictEqual(stripe.verifySignature(body, h, 'other', { now }), false);
  assert.strictEqual(stripe.verifySignature(body + ' ', h, secret, { now }), false);
  assert.strictEqual(stripe.verifySignature(body, h, secret, { now: now + 301 }), false);
  assert.strictEqual(stripe.verifySignature(body, '', secret, { now }), false);
  assert.strictEqual(stripe.verifySignature(body, h, '', { now }), false);
});

test('Stripe events map to payments only when they carry a LIV invoice id', () => {
  const ev = (type, o) => ({ type, data: { object: o } });
  assert.deepStrictEqual(stripe.paymentFromEvent(ev('payment_intent.succeeded', { id: 'pi_1', amount_received: 5000, metadata: { liv_invoice_id: 'inv1' } })), { invoiceId: 'inv1', amount_cents: 5000, provider_payment_id: 'pi_1', method: 'card' });
  assert.strictEqual(stripe.paymentFromEvent(ev('payment_intent.succeeded', { id: 'pi_2', amount: 100, metadata: {} })), null);
  assert.strictEqual(stripe.paymentFromEvent(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid', metadata: { liv_invoice_id: 'x' } })), null);
  assert.strictEqual(stripe.paymentFromEvent(ev('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', amount_total: 900, payment_intent: 'pi_9', metadata: { liv_invoice_id: 'x' } })).provider_payment_id, 'pi_9');
  assert.strictEqual(stripe.paymentFromEvent(ev('customer.created', { id: 'c' })), null);
  assert.strictEqual(stripe.paymentFromEvent({}), null);
});
