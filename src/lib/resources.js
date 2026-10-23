// Individuals portal M3: member resources (guides, templates, checklists, articles, tools; preparation later) and purchases.
// Access is decided on the server: free (any account), members (an active membership), purchase (a paid, unexpired purchase).
// A resource is published only after a review by someone other than the person who submitted it. A price is commercial
// policy: only the main account approves it, and editing a price withdraws that approval. Preparation products stay closed
// until they are linked to an assessment program that is published and operating. Nothing here grants a credential or CPD units.
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { isMainAccount } = require('./exceptions');

class ResourceError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const KINDS = { guide: 'Guide', template: 'Template', checklist: 'Checklist', article: 'Article', tool: 'Tool', preparation: 'Preparation' };
const ACCESS = { free: 'Free with an account', members: 'Included with membership', purchase: 'Sold separately' };
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));
const slugify = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'resource';
const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => { const s = String(v ?? '').trim(); if (!s) return null; if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) throw new ResourceError('Enter prices in US dollars, for example 25 or 25.00.'); return Math.round(Number(s) * 100); };

/** Why a resource cannot be bought now; empty when it can. */
function saleBlockers(r, scheme, { salesOpen = cfg.productSales } = {}) {
  const out = [];
  if (r.access !== 'purchase') return ['This resource is not sold separately.'];
  if (!salesOpen) out.push('Sales of resources are not open yet.');
  if (r.status !== 'published') out.push('Not published.');
  if (r.price_cents == null) out.push('No price set.');
  if (!r.sale_approved_at) out.push('Price not approved.');
  if (r.kind === 'preparation' && !(scheme && scheme.status === 'published' && ['assessed_qualification', 'professional_certification'].includes(scheme.record_type)))
    out.push('Preparation products open only with an operating assessment program.');
  return out;
}

async function save(user, id, f) {
  const title = String(f.title || '').trim(); const summary = String(f.summary || '').trim(); const body = String(f.body_md || '');
  if (title.length < 3 || title.length > 200) throw new ResourceError('Enter a title (3 to 200 characters).');
  if ([title, summary, body, f.author_name].some(hasNonLatin)) throw new ResourceError('Write the resource in English (Latin letters).');
  const kind = KINDS[f.kind] ? f.kind : 'guide'; const access = ACCESS[f.access] ? f.access : 'free';
  const price = money(f.price); const member = money(f.member_price);
  if (member != null && price != null && member > price) throw new ResourceError('The member price cannot be higher than the general price.');
  const months = String(f.access_months || '').trim(); if (months && !(/^\d+$/.test(months) && +months >= 1 && +months <= 120)) throw new ResourceError('Access period: 1 to 120 months, or empty for permanent access.');
  const vals = [title, summary.slice(0, 600), body.slice(0, 100000), String(f.author_name || '').slice(0, 200), kind, access, price, member, months ? +months : null, f.scheme_id || null];
  if (!id) {
    let slug = slugify(title);
    const { rows: [dup] } = await q('SELECT 1 FROM resources WHERE slug = $1', [slug]); if (dup) slug = `${slug}-${Date.now().toString(36)}`;
    const { rows: [r] } = await q(`INSERT INTO resources (title, summary, body_md, author_name, kind, access, price_cents, member_price_cents, access_months, scheme_id, slug, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [...vals, slug, user.id]);
    await audit({ user, action: 'resource.create', target: slug }); return r.id;
  }
  const { rows: [cur] } = await q('SELECT * FROM resources WHERE id = $1', [id]);
  if (!cur) throw new ResourceError('Not found.', 404);
  // Any change goes back to draft and needs a new review; a price change also withdraws the price approval.
  const priceChanged = cur.price_cents !== vals[6] || cur.member_price_cents !== vals[7] || cur.access_months !== vals[8] || cur.access !== access;
  await q(`UPDATE resources SET title=$1, summary=$2, body_md=$3, author_name=$4, kind=$5, access=$6, price_cents=$7, member_price_cents=$8, access_months=$9, scheme_id=$10,
    status = 'draft', version = version + CASE WHEN status = 'published' THEN 1 ELSE 0 END, reviewed_by = NULL, reviewed_at = NULL,
    sale_approved_by = CASE WHEN $12 THEN NULL ELSE sale_approved_by END, sale_approved_at = CASE WHEN $12 THEN NULL ELSE sale_approved_at END, updated_at = now() WHERE id = $11`, [...vals, id, priceChanged]);
  await audit({ user, action: 'resource.edit', target: cur.slug, metadata: { price_changed: priceChanged } });
  return id;
}

async function attachFile(user, id, file) {
  const { putFile } = require('./files');
  if (!file || !file.buffer?.length) throw new ResourceError('Choose a file.');
  if (file.size > 10 * 1024 * 1024) throw new ResourceError('Files up to 10 MB.');
  const kind = require('./applications').sniff(file.buffer);
  if (!kind) throw new ResourceError('PDF, PNG or JPEG only (checked by content).');
  const key = `resources/${id}/${Date.now()}.${kind.ext}`;
  await putFile(key, file.buffer);
  await q(`UPDATE resources SET file_key = $1, file_name = $2, status = 'draft', reviewed_by = NULL, reviewed_at = NULL, updated_at = now() WHERE id = $3`, [key, String(file.originalname || 'file').slice(0, 200), id]);
  await audit({ user, action: 'resource.file', target: id });
}

async function submit(user, id) {
  const { rowCount } = await q(`UPDATE resources SET status = 'in_review', submitted_by = $2, updated_at = now() WHERE id = $1 AND status = 'draft' AND (length(body_md) > 0 OR file_key IS NOT NULL)`, [id, user.id]);
  if (!rowCount) throw new ResourceError('Only a draft with content or a file can be sent for review.');
  await audit({ user, action: 'resource.submit', target: id });
}

/** Publication needs a reviewer who did not submit the resource. */
async function review(user, id, approve, note) {
  const { rows: [r] } = await q('SELECT * FROM resources WHERE id = $1', [id]);
  if (!r || r.status !== 'in_review') throw new ResourceError('Only a resource in review can be decided.');
  if (r.submitted_by === user.id) throw new ResourceError('A different person reviews the resource before it is published.', 403);
  await q(`UPDATE resources SET status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() WHERE id = $1`, [id, approve ? 'published' : 'draft', user.id]);
  await audit({ user, action: approve ? 'resource.publish' : 'resource.return', target: r.slug, metadata: { note: String(note || '').slice(0, 500) } });
}

async function retire(user, id) {
  await q(`UPDATE resources SET status = 'retired', updated_at = now() WHERE id = $1`, [id]);
  await audit({ user, action: 'resource.retire', target: id });
}

async function approvePrice(user, id) {
  if (!(await isMainAccount(user))) throw new ResourceError('Only the main account approves a price.', 403);
  const { rows: [r] } = await q('SELECT * FROM resources WHERE id = $1', [id]);
  if (!r || r.access !== 'purchase' || r.price_cents == null) throw new ResourceError('Set a general price on a resource sold separately first.');
  await q('UPDATE resources SET sale_approved_by = $2, sale_approved_at = now() WHERE id = $1', [id, user.id]);
  await audit({ user, action: 'resource.price_approve', target: r.slug, metadata: { price_cents: r.price_cents, member_price_cents: r.member_price_cents, access_months: r.access_months } });
}

async function activeMember(userId) {
  const { rows: [m] } = await q(`SELECT 1 FROM memberships WHERE user_id = $1 AND status = 'active' AND current_date BETWEEN starts_on AND ends_on`, [userId]);
  return Boolean(m);
}

/** May this person open the resource now? Returns { ok, reason }. */
async function canAccess(user, r) {
  if (!user || r.status !== 'published') return { ok: false, reason: 'Sign in to open this resource.' };
  if (r.access === 'free') return { ok: true };
  if (r.access === 'members') return (await activeMember(user.id)) ? { ok: true } : { ok: false, reason: 'Included with an active membership.' };
  const { rows: [p] } = await q(`SELECT 1 FROM resource_purchases WHERE user_id = $1 AND resource_id = $2 AND status = 'active' AND (access_until IS NULL OR access_until >= current_date)`, [user.id, r.id]);
  return p ? { ok: true } : { ok: false, reason: 'Sold separately.' };
}

async function listPublished() {
  const { rows } = await q(`SELECT r.*, s.status AS scheme_status, s.record_type AS scheme_type FROM resources r LEFT JOIN credential_schemes s ON s.id = r.scheme_id
    WHERE r.status = 'published' ORDER BY r.kind, r.title`);
  return rows.map((r) => ({ ...r, blockers: saleBlockers(r, r.scheme_id ? { status: r.scheme_status, record_type: r.scheme_type } : null) }));
}
async function bySlug(slug) {
  const { rows: [r] } = await q(`SELECT r.*, s.status AS scheme_status, s.record_type AS scheme_type FROM resources r LEFT JOIN credential_schemes s ON s.id = r.scheme_id WHERE r.slug = $1`, [String(slug).slice(0, 120)]);
  return r ? { ...r, blockers: saleBlockers(r, r.scheme_id ? { status: r.scheme_status, record_type: r.scheme_type } : null) } : null;
}

/** Buys a resource at the price that applies now (member price only with an active membership). The price is fixed on the order. */
async function buy(user, slug) {
  const r = await bySlug(slug);
  if (!r) throw new ResourceError('Not found.', 404);
  if (r.blockers.length) throw new ResourceError(r.blockers.join(' '), 409);
  if ((await canAccess(user, r)).ok) throw new ResourceError('You already have access to this resource.', 409);
  const member = r.member_price_cents != null && (await activeMember(user.id));
  const cents = member ? r.member_price_cents : r.price_cents;
  const billing = require('./billing-store');
  const out = await tx(async (c) => {
    const inv = await billing.createIndividualDraft(c, { userId: user.id, code: 'RESOURCE', description: `${r.title} (${r.access_months ? `${r.access_months} month(s) access` : 'permanent access'})${member ? ', member price' : ''}`, cents, notes: r.title });
    try {
      const { rows: [p] } = await c.query(`INSERT INTO resource_purchases (user_id, resource_id, status, price_cents, member_price_applied, terms, invoice_id) VALUES ($1,$2,'pending_payment',$3,$4,$5,$6) RETURNING id`,
        [user.id, r.id, cents, member, JSON.stringify({ title: r.title, version: r.version, price_cents: cents, access_months: r.access_months }), inv]);
      await audit({ user, action: 'resource.order', target: r.slug, metadata: { cents, member } }, c);
      return { purchaseId: p.id, invoiceId: inv };
    } catch (e) { if (e.code === '23505') throw new ResourceError('You already have an order waiting for payment for this resource.', 409); throw e; }
  });
  const issued = await billing.issueInvoice(out.invoiceId);
  if (issued.paid) await onInvoicePaid(out.invoiceId);
  return out;
}

/** Idempotent: a repeated payment notice finds no pending order. Access runs from payment for the period fixed on the order. */
async function onInvoicePaid(invoiceId) {
  const { rows: [p] } = await q(`UPDATE resource_purchases SET status = 'active', activated_at = now(),
      access_until = CASE WHEN (terms->>'access_months') IS NULL THEN NULL ELSE (current_date + make_interval(months => (terms->>'access_months')::int) - interval '1 day')::date END
    WHERE invoice_id = $1 AND status = 'pending_payment' RETURNING id`, [invoiceId]);
  if (p) await audit({ actorLabel: 'payment', action: 'resource.purchase_active', target: p.id });
  return p || null;
}

async function library(userId) {
  const { rows } = await q(`SELECT p.*, r.slug, r.title, r.kind FROM resource_purchases p JOIN resources r ON r.id = p.resource_id WHERE p.user_id = $1 AND p.status <> 'void' ORDER BY p.created_at DESC`, [userId]);
  return rows;
}

module.exports = { ResourceError, KINDS, ACCESS, saleBlockers, save, attachFile, submit, review, retire, approvePrice, canAccess, activeMember, listPublished, bySlug, buy, onInvoicePaid, library, today };
