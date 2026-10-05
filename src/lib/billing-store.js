// Billing persistence: catalog seed, usage, invoices (draft, issue, pay, void). See docs/BILLING.md.
const { q, tx } = require('../db');
const billing = require('./billing');
const { CATALOG } = require('./billing-catalog');

async function seedCatalog() {
  const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM billing_products');
  if (n) return false;
  await tx(async (c) => {
    for (const p of CATALOG) {
      const { rows: [row] } = await c.query(`INSERT INTO billing_products (code, name, description, category, unit, phase, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [p.code, p.name, p.description, p.category, p.unit, p.phase, p.active, p.sort]);
      for (const pr of p.prices) await c.query('INSERT INTO billing_prices (product_id, plan, min_qty, unit_amount_cents) VALUES ($1,$2,$3,$4)', [row.id, pr.plan, pr.min_qty, pr.cents]);
    }
  });
  return true;
}

async function priceRows(code) {
  const { rows } = await q(`SELECT pr.* FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE p.code = $1 ORDER BY pr.min_qty`, [code]);
  return rows;
}

/** Certificates issued in the partner's plan year, the allowance, and what is still unbilled. */
async function usageSummary(platform, today = new Date()) {
  const py = billing.planYear(platform, today);
  const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM certificates WHERE platform_id = $1 AND created_at >= $2 AND created_at < $3', [platform.id, py.start, py.end]);
  const { rows: [{ b }] } = await q(`SELECT COALESCE(sum(l.quantity), 0)::int AS b FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
    WHERE i.platform_id = $1 AND i.status <> 'void' AND l.product_code = 'CERT_ISSUE' AND l.plan_year_start = $2`, [platform.id, py.start]);
  const bands = billing.bandsFor(await priceRows('CERT_ISSUE'), platform.plan, today);
  const included = billing.includedFor(platform);
  return { planYear: py, issued: n, included, billedBeyond: b, ...billing.usageLine({ issued: n, included, billedBeyond: b, bands }), bands };
}

/**
 * Creates a draft invoice. items: [{ code, qty }]; includeUsage adds the unbilled certificate usage for the plan year.
 * Throws a plain Error with a message for the administrator when something cannot be priced.
 */
async function createDraft(platform, { items = [], includeUsage = false, notes = '', createdBy = null, today = new Date() }) {
  const lines = [];
  for (const it of items) {
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const { rows: [prod] } = await q('SELECT * FROM billing_products WHERE code = $1 AND active', [it.code]);
    if (!prod) throw new Error(`"${it.code}" is not an active product.`);
    const bands = billing.bandsFor(await priceRows(it.code), platform.plan, today);
    const unit = billing.unitPrice(bands, qty);
    if (unit == null) throw new Error(`No current price for ${prod.name}${platform.plan ? '' : '. Assign the partner a plan first'}.`);
    lines.push({ product_code: it.code, description: prod.name, quantity: qty, unit_amount_cents: unit, amount_cents: unit * qty });
  }
  let usage = null;
  if (includeUsage) {
    usage = await usageSummary(platform, today);
    if (usage.quantity > 0) lines.push({ product_code: 'CERT_ISSUE', description: `Certificates issued beyond the included ${usage.included} (plan year ${usage.planYear.start} to ${usage.planYear.end}), numbers ${usage.offset + 1}-${usage.offset + usage.quantity}`, quantity: usage.quantity, unit_amount_cents: usage.unit_amount_cents, amount_cents: usage.amount_cents, usage_offset: usage.offset, plan_year_start: usage.planYear.start });
  }
  if (!lines.length) throw new Error('Nothing to invoice: add at least one item, or there is no unbilled certificate usage.');
  const { rows: discounts } = await q('SELECT * FROM billing_discounts WHERE platform_id = $1 AND used_invoice_id IS NULL', [platform.id]);
  const d = billing.applyDiscounts(lines, discounts, today);
  const t = billing.totals(d.lines, d.credit_cents, platform.tax_rate_bps);
  return tx(async (c) => {
    const { rows: [inv] } = await c.query(`INSERT INTO invoices (platform_id, status, tax_label, tax_rate_bps, subtotal_cents, discount_cents, tax_cents, total_cents, period_start, period_end, notes, created_by)
      VALUES ($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [platform.id, platform.tax_label, platform.tax_rate_bps, t.subtotal_cents, t.discount_cents, t.tax_cents, t.total_cents, usage ? usage.planYear.start : null, usage ? usage.planYear.end : null, String(notes).slice(0, 2000), createdBy]);
    for (const l of d.lines) await c.query(`INSERT INTO invoice_lines (invoice_id, product_code, description, quantity, unit_amount_cents, amount_cents, discount_cents, usage_offset, plan_year_start) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [inv.id, l.product_code, l.description, l.quantity, l.unit_amount_cents, l.amount_cents, l.discount_cents, l.usage_offset ?? null, l.plan_year_start ?? null]);
    for (const cr of d.credits) await c.query('UPDATE billing_discounts SET used_invoice_id = $1 WHERE id = $2 AND used_invoice_id IS NULL', [inv.id, cr.id]);
    return inv.id;
  });
}

/** Assigns the next invoice number and opens the invoice. A zero-total invoice is marked paid straight away. */
async function issueInvoice(id, { dueDays = 14, today = new Date() } = {}) {
  return tx(async (c) => {
    const { rows: [inv] } = await c.query(`SELECT i.*, p.billing_name, p.billing_email, p.billing_address, p.tax_id, p.company_name, p.country FROM invoices i JOIN platforms p ON p.id = i.platform_id WHERE i.id = $1 FOR UPDATE OF i`, [id]);
    if (!inv || inv.status !== 'draft') throw new Error('Only a draft invoice can be issued.');
    const { rows: [{ seq }] } = await c.query(`SELECT nextval('invoice_number_seq') AS seq`);
    const issue = billing.iso(today); const number = billing.formatInvoiceNumber(issue.slice(0, 4), seq);
    const snapshot = { name: inv.billing_name || inv.company_name, company: inv.company_name, email: inv.billing_email || null, address: inv.billing_address || null, tax_id: inv.tax_id || null, country: inv.country || null };
    const paid = Number(inv.total_cents) === 0;
    await c.query(`UPDATE invoices SET status = $2, number = $3, issue_date = $4, due_date = $5, billing = $6, issued_at = now(), paid_at = $7 WHERE id = $1`,
      [id, paid ? 'paid' : 'open', number, issue, billing.addDaysISO(issue, dueDays), JSON.stringify(snapshot), paid ? new Date() : null]);
    return { number, paid };
  });
}

/** Records a payment (manual or from a provider). Idempotent on provider_payment_id. Throws on overpayment or a non-open invoice. */
async function recordPayment(invoiceId, { amount_cents, method, reference = '', received_on, provider = 'manual', provider_payment_id = null, userId = null }) {
  const amt = Math.round(Number(amount_cents));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a payment amount above zero.');
  return tx(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
    if (!inv) throw new Error('Invoice not found.');
    if (provider_payment_id) { const { rows: dup } = await c.query('SELECT 1 FROM payments WHERE provider_payment_id = $1', [provider_payment_id]); if (dup.length) return { duplicate: true, invoice: inv }; }
    if (inv.status !== 'open') throw new Error(`Payments can only be recorded on an open invoice (this one is ${inv.status}).`);
    if (Number(inv.amount_paid_cents) + amt > Number(inv.total_cents)) throw new Error(`The payment exceeds the balance (${billing.money(Number(inv.total_cents) - Number(inv.amount_paid_cents))}).`);
    await c.query(`INSERT INTO payments (invoice_id, amount_cents, method, provider, provider_payment_id, reference, received_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [invoiceId, amt, method, provider, provider_payment_id, String(reference).slice(0, 200), received_on || billing.iso(new Date()), userId]);
    const a = billing.afterPayment(Number(inv.total_cents), Number(inv.amount_paid_cents), amt);
    await c.query('UPDATE invoices SET amount_paid_cents = $2, status = $3::varchar, paid_at = CASE WHEN $3::varchar = \'paid\' THEN now() ELSE paid_at END WHERE id = $1', [invoiceId, a.amount_paid_cents, a.status]);
    return { duplicate: false, status: a.status, paid: a.amount_paid_cents };
  });
}

/** Drafts are deleted; an open invoice with no payments is voided (its number stays on record). Discount credits it used are released. */
async function discardInvoice(id) {
  return tx(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.status === 'draft') { await c.query('UPDATE billing_discounts SET used_invoice_id = NULL WHERE used_invoice_id = $1', [id]); await c.query('DELETE FROM invoices WHERE id = $1', [id]); return 'deleted'; }
    if (inv.status === 'open' && Number(inv.amount_paid_cents) === 0) {
      await c.query('UPDATE billing_discounts SET used_invoice_id = NULL WHERE used_invoice_id = $1', [id]);
      await c.query(`UPDATE invoices SET status = 'void', voided_at = now() WHERE id = $1`, [id]); return 'voided';
    }
    throw new Error('Only a draft or an unpaid open invoice can be removed. Record a refund outside the system for paid invoices.');
  });
}
module.exports = { seedCatalog, priceRows, usageSummary, createDraft, issueInvoice, recordPayment, discardInvoice };
