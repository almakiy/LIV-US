// Requests for a training quote (owner decision, October 26, 2026). Routing is fair and transparent: the same request goes at once
// to up to five Authorized Training Providers that hold the requested scope, preferring the requested city when any match, and
// choosing those that received the fewest requests in the last 90 days (ties at random). The partner level never gives priority.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ipHash } = require('./crypto');
const E = require('./email');

const MAX_RECIPIENTS = 5;
const DELIVERY = { any: 'Any', in_person: 'In person', online: 'Online', blended: 'Blended' };
const CONSENT_TEXT = 'I agree that LIV sends these details to up to five Authorized Training Providers with this scope so that they can contact me about this request.';
class QuoteError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));
const PUBLIC = `p.accreditation_status = 'active' AND p.public_slug IS NOT NULL AND NOT p.is_preview`;

async function scopeOptions() {
  return (await q(`SELECT DISTINCT s.title FROM partner_scopes s JOIN platforms p ON p.id = s.platform_id WHERE s.status = 'active' AND ${PUBLIC} ORDER BY s.title`)).rows.map((r) => r.title);
}

/** Providers that would receive a request now, in routing order. */
async function route(scope, city) {
  const base = `SELECT p.id, p.company_name, p.public_slug,
      (SELECT count(*) FROM quote_request_recipients x WHERE x.platform_id = p.id AND x.sent_at > now() - interval '90 days')::int AS recent
    FROM platforms p WHERE ${PUBLIC} AND EXISTS (SELECT 1 FROM partner_scopes s WHERE s.platform_id = p.id AND s.status = 'active' AND s.title = $1)`;
  const cityCond = ` AND (lower(p.public_city) = lower($2) OR EXISTS (SELECT 1 FROM partner_branches b WHERE b.platform_id = p.id AND b.status = 'approved' AND lower(b.city) = lower($2)))`;
  const order = ` ORDER BY recent, random() LIMIT ${MAX_RECIPIENTS}`;
  if (city) {
    const { rows } = await q(base + cityCond + order, [scope, city]);
    if (rows.length) return { providers: rows, cityMatched: true };
  }
  return { providers: (await q(base + order, [scope])).rows, cityMatched: false };
}

async function submit(f, ip) {
  const t = (k, n) => String(f[k] || '').trim().slice(0, n);
  const org = t('org_name', 200), name = t('contact_name', 150), email = t('email', 255).toLowerCase(), phone = t('phone', 40), scope = t('scope', 200), city = t('city', 120), message = t('message', 3000);
  const learners = f.learners ? parseInt(f.learners, 10) : null;
  const delivery = DELIVERY[f.delivery] ? f.delivery : 'any';
  if (org.length < 2 || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new QuoteError('Give the organization, your name and a valid email address.');
  if (!(await scopeOptions()).includes(scope)) throw new QuoteError('Choose a training scope from the list.');
  if (learners !== null && !(learners >= 1 && learners <= 100000)) throw new QuoteError('Give the number of learners as a whole number, or leave it empty.');
  if ([org, name, city, message].some(hasNonLatin)) throw new QuoteError('Write the request in English (Latin letters).');
  if (f.consent !== 'yes') throw new QuoteError('Confirm that LIV may send your request to the providers.');
  const { providers, cityMatched } = await route(scope, city);
  if (!providers.length) throw new QuoteError('No Authorized Training Provider holds this scope at the moment.', 409);
  const id = await tx(async (c) => {
    const { rows: [r] } = await c.query(`INSERT INTO quote_requests (org_name, contact_name, email, phone, scope_title, city, learners, delivery, message, consent_text, city_matched, ip_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [org, name, email, phone || null, scope, city || null, learners, delivery, message, CONSENT_TEXT, cityMatched, ipHash(ip)]);
    for (const p of providers) await c.query('INSERT INTO quote_request_recipients (request_id, platform_id) VALUES ($1,$2)', [r.id, p.id]);
    return r.id;
  });
  for (const p of providers) await E.queueToPlatform(p.id, 'quote_request', { org, scope, city }, `quote:${id}:${p.id}`);
  await E.queue({ to: email, name, template: 'quote_request_sent', data: { scope, providers: providers.map((p) => p.company_name).join(', ') }, dedupeKey: `quote-sent:${id}` }).catch(() => {});
  await audit({ actorLabel: 'public', action: 'quote.submit', target: id, metadata: { scope, recipients: providers.length, cityMatched } });
  return { id, providers, cityMatched };
}

async function forPlatform(platformId) {
  return (await q(`SELECT r.*, x.sent_at FROM quote_request_recipients x JOIN quote_requests r ON r.id = x.request_id WHERE x.platform_id = $1 ORDER BY x.sent_at DESC LIMIT 200`, [platformId])).rows;
}
async function adminList() {
  return (await q(`SELECT r.id, r.org_name, r.scope_title, r.city, r.city_matched, r.created_at,
      (SELECT string_agg(p.company_name, ', ' ORDER BY p.company_name) FROM quote_request_recipients x JOIN platforms p ON p.id = x.platform_id WHERE x.request_id = r.id) AS sent_to
    FROM quote_requests r ORDER BY r.created_at DESC LIMIT 200`)).rows;
}

module.exports = { QuoteError, DELIVERY, CONSENT_TEXT, MAX_RECIPIENTS, scopeOptions, route, submit, forPlatform, adminList };
