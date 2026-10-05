// Billing arithmetic (pure functions). All money is integer cents (USD). Rounding is half-up. See docs/FEES.md.
const { PLAN_DEFAULTS } = require('./billing-catalog');

const money = (cents, cur = 'USD') => `${cur === 'USD' ? '$' : `${cur} `}${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const roundDiv = (n, d) => Math.floor((n * 2 + d) / (d * 2)); // half-up for non-negative n
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDaysISO = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addYearsISO = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); };
const formatInvoiceNumber = (year, seq) => `INV-${year}-${String(seq).padStart(4, '0')}`;

/**
 * Bands in force for a product on a date. `rows` are billing_prices rows ({plan, min_qty, unit_amount_cents, valid_from, valid_to}) for ONE product.
 * Plan-specific rows win over plan-less rows when the partner has a plan. Returns [{min_qty, cents}] sorted by min_qty.
 */
function bandsFor(rows, plan, onDate) {
  const d = iso(onDate || new Date());
  const live = rows.filter((r) => iso(r.valid_from) <= d && (!r.valid_to || iso(r.valid_to) >= d));
  const specific = plan ? live.filter((r) => r.plan === plan) : [];
  const chosen = specific.length ? specific : live.filter((r) => !r.plan);
  return chosen.map((r) => ({ min_qty: r.min_qty, cents: r.unit_amount_cents })).sort((a, b) => a.min_qty - b.min_qty);
}
/** Price of one unit for flat products: the band with the highest min_qty not above qty. */
function unitPrice(bands, qty = 1) {
  let cents = null;
  for (const b of bands) if (b.min_qty <= qty) cents = b.cents;
  return cents;
}
/** Graduated amount for `qty` units that follow `offset` units already counted; each position is priced by the band it falls in. */
function graduatedAmount(offset, qty, bands) {
  if (!bands.length || qty <= 0) return 0;
  let total = 0;
  for (let i = 0; i < bands.length; i++) {
    const from = bands[i].min_qty; const to = i + 1 < bands.length ? bands[i + 1].min_qty - 1 : Infinity;
    const lo = Math.max(offset + 1, from); const hi = Math.min(offset + qty, to);
    if (hi >= lo) total += (hi - lo + 1) * bands[i].cents;
  }
  return total;
}

/** Plan year containing `today`: [start, end) based on the renewal date; calendar year when the partner has no renewal date. */
function planYear(platform, today = new Date()) {
  const t = iso(today);
  if (platform.plan_renews_on) {
    let end = iso(platform.plan_renews_on);
    while (end <= t) end = addYearsISO(end, 1);
    while (addYearsISO(end, -1) > t) end = addYearsISO(end, -1);
    return { start: addYearsISO(end, -1), end };
  }
  const y = Number(t.slice(0, 4));
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}
const includedFor = (platform) => (Number.isInteger(platform.included_certificates) ? platform.included_certificates : (PLAN_DEFAULTS[platform.plan]?.included ?? 0));

/**
 * Usage line for certificates issued in the plan year: certificates beyond the allowance not yet billed.
 * `issued` = certificates in the plan year; `billedBeyond` = quantity already billed on non-void invoices for this plan year.
 */
function usageLine({ issued, included, billedBeyond, bands }) {
  const beyondTotal = Math.max(0, issued - included);
  const quantity = Math.max(0, beyondTotal - billedBeyond);
  const amount = graduatedAmount(billedBeyond, quantity, bands);
  return { quantity, offset: billedBeyond, amount_cents: amount, unit_amount_cents: quantity ? roundDiv(amount, quantity) : 0, beyondTotal };
}

/** Percent discounts reduce matching lines (capped at 100% per line); fixed credits then reduce the remainder once. Returns lines with discount_cents and the credits used. */
function applyDiscounts(lines, discounts, today = new Date()) {
  const d = iso(today);
  const live = discounts.filter((x) => !x.used_invoice_id && (!x.valid_until || iso(x.valid_until) >= d));
  const out = lines.map((l) => {
    const bps = Math.min(10000, live.filter((x) => x.percent_bps != null && (!x.product_code || x.product_code === l.product_code)).reduce((s, x) => s + x.percent_bps, 0));
    return { ...l, discount_cents: roundDiv(l.amount_cents * bps, 10000) };
  });
  let remaining = out.reduce((s, l) => s + (l.amount_cents - l.discount_cents), 0); const credits = [];
  for (const x of live.filter((c) => c.amount_cents != null)) { const used = Math.min(remaining, x.amount_cents); if (used > 0) { credits.push({ id: x.id, cents: used }); remaining -= used; } }
  return { lines: out, credits, credit_cents: credits.reduce((s, c) => s + c.cents, 0) };
}
function totals(lines, creditCents, taxBps) {
  const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0);
  const discount = lines.reduce((s, l) => s + l.discount_cents, 0) + creditCents;
  const taxable = Math.max(0, subtotal - discount);
  const tax = roundDiv(taxable * (taxBps || 0), 10000);
  return { subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: taxable + tax };
}
/** After a payment: status and paid amount. Overpayment is refused by the caller. */
const afterPayment = (total, paidBefore, amount) => { const paid = paidBefore + amount; return { amount_paid_cents: paid, status: paid >= total ? 'paid' : 'open' }; };
const isOverdue = (inv, today = new Date()) => inv.status === 'open' && inv.due_date && iso(inv.due_date) < iso(today);

module.exports = { money, roundDiv, iso, addDaysISO, addYearsISO, formatInvoiceNumber, bandsFor, unitPrice, graduatedAmount, planYear, includedFor, usageLine, applyDiscounts, totals, afterPayment, isOverdue };
