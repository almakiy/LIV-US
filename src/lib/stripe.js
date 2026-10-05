// Stripe readiness (not connected yet). Verifies webhook signatures and maps events to LIV payments without any SDK or network call.
// Creating customers, invoices or checkout sessions through Stripe is the next step and needs the owner's Stripe account.
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
module.exports = { verifySignature, signHeader, paymentFromEvent };
