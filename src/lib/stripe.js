// Stripe integration without an SDK: verifies webhook signatures, maps events to LIV payments, and creates hosted Checkout sessions for open invoices.
const crypto = require('crypto');

/** Stripe-Signature header: "t=timestamp,v1=hexsig[,v1=...]". Signature = HMAC-SHA256(secret, `${t}.${payload}`). */
function verifySignature(payload, header, secret, { tolerance = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map((p) => p.split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
/** Test helper and documentation of the scheme: builds a valid header. */
const signHeader = (payload, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

/**
 * Events that mean "money received for a LIV invoice". LIV sets metadata.liv_invoice_id on the Stripe object it creates.
 * Returns { invoiceId, amount_cents, provider_payment_id, method } or null for anything else.
 */
function paymentFromEvent(event) {
  const o = event?.data?.object; if (!o) return null;
  const meta = o.metadata || {};
  if (event.type === 'checkout.session.completed' && o.payment_status === 'paid' && meta.liv_invoice_id)
    return { invoiceId: meta.liv_invoice_id, amount_cents: o.amount_total, provider_payment_id: String(o.payment_intent || o.id), method: 'card' };
  if (event.type === 'payment_intent.succeeded' && meta.liv_invoice_id)
    return { invoiceId: meta.liv_invoice_id, amount_cents: o.amount_received ?? o.amount, provider_payment_id: String(o.id), method: 'card' };
  if (event.type === 'invoice.paid' && (meta.liv_invoice_id || o.metadata?.liv_invoice_id))
    return { invoiceId: meta.liv_invoice_id, amount_cents: o.amount_paid, provider_payment_id: String(o.payment_intent || o.id), method: 'card' };
  return null;
}

const STRIPE_MIN_CENTS = 50;
/** Stripe's form encoding: nested keys as a[b][c]=v. */
function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out); else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}
/**
 * Creates a Stripe Checkout Session for the open balance of an invoice (card payment, USD). Returns { id, url }.
 * metadata.liv_invoice_id is how the webhook finds the invoice. The idempotency key stops duplicate sessions on double clicks.
 */
async function createCheckoutSession({ secretKey, invoice, balanceCents, customerEmail, baseUrl, fetchImpl = fetch }) {
  if (!secretKey) throw new Error('Stripe is not configured.');
  if (!(balanceCents >= STRIPE_MIN_CENTS)) throw new Error('The balance is below the minimum card payment.');
  const body = formEncode({
    mode: 'payment',
    customer_email: customerEmail,
    client_reference_id: invoice.id,
    success_url: `${baseUrl}/portal/billing/invoices/${invoice.id}?paid=1`,
    cancel_url: `${baseUrl}/portal/billing/invoices/${invoice.id}`,
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: balanceCents, product_data: { name: `LIV invoice ${invoice.number}` } } }],
    metadata: { liv_invoice_id: invoice.id, liv_invoice_number: invoice.number },
    payment_intent_data: { description: `LIV invoice ${invoice.number}`, metadata: { liv_invoice_id: invoice.id } },
  }).join('&');
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `liv-${invoice.id}-${balanceCents}-${Math.floor(Date.now() / 600000)}` },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.url) throw new Error(`Stripe error ${res.status}: ${j?.error?.message || 'unknown'}`);
  return { id: j.id, url: j.url };
}
module.exports = { verifySignature, signHeader, paymentFromEvent, createCheckoutSession, formEncode, STRIPE_MIN_CENTS };
