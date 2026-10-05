// Stripe webhook receiver (not connected yet: answers 501 until STRIPE_WEBHOOK_SECRET is set). Mounted with a raw body so the signature can be verified.
const cfg = require('../config');
const { audit } = require('../lib/audit');
const { verifySignature, paymentFromEvent } = require('../lib/stripe');
const { recordPayment } = require('../lib/billing-store');
const { wrap } = require('../lib/guards');

const UUID_RE = /^[0-9a-f-]{36}$/i;
module.exports = wrap(async (req, res) => {
  if (!cfg.stripeWebhookSecret) return res.status(501).json({ error: 'Stripe webhook is not configured.' });
  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifySignature(payload, req.get('stripe-signature'), cfg.stripeWebhookSecret)) return res.status(400).json({ error: 'Invalid signature.' });
  let event; try { event = JSON.parse(payload); } catch (_) { return res.status(400).json({ error: 'Invalid JSON.' }); }
  const pay = paymentFromEvent(event);
  if (pay && UUID_RE.test(String(pay.invoiceId))) {
    try {
      const out = await recordPayment(pay.invoiceId, { amount_cents: pay.amount_cents, method: pay.method, provider: 'stripe', provider_payment_id: pay.provider_payment_id, reference: `Stripe event ${event.id}`.slice(0, 200) });
      await audit({ actorLabel: 'stripe', action: out.duplicate ? 'billing.stripe.duplicate' : 'billing.stripe.payment', target: pay.invoiceId, metadata: { event: event.id } });
    } catch (e) {
      if (e.code) throw e; // database trouble: let Stripe retry
      await audit({ actorLabel: 'stripe', action: 'billing.stripe.rejected', target: pay.invoiceId, metadata: { event: event.id, reason: e.message } }); // business rule (overpayment, not open): do not retry
    }
  }
  res.json({ received: true });
});
