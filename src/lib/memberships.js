// Individuals portal M2: membership plans, memberships, payment and renewal, the membership card and its verification.
// Rules: membership is optional and never a credential; it never affects eligibility, assessment or a credential's validity.
// Plans, prices, periods and benefits are records, never constants: nothing is sold until the main account approves a
// version, puts the plan on sale, every promised benefit is available, and MEMBERSHIP_SALES is on. A membership keeps a
// copy of the terms it was taken on, so a later change never alters an earlier purchase.
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { randomCode } = require('./crypto');
const { isMainAccount } = require('./exceptions');

class MembershipError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

// Proposed plans from the owner's scope document (October 22, 2026). Starting prices proposed on the owner's request of the same day
// (docs/INDIVIDUALS-PORTAL.md, "Proposed starting prices"): they are written into the draft terms only; the main account still
// approves them, and nothing is sold before that. Group price is per named seat.
const PROPOSED = [
  { code: 'member', name: 'LIV Member', audience: 'The core paid membership for individuals.', kind: 'individual', sort: 1, price_cents: 19500, period_months: 12,
    benefits: ['Digital membership card with a verification link', 'Selected library resources', 'Member prices on eligible products', 'Included community sessions'] },
  { code: 'member_plus', name: 'LIV Member Plus', audience: 'A wider plan, offered only once its extra benefits exist.', kind: 'individual', sort: 2, price_cents: 34500, period_months: 12,
    benefits: ['Everything in LIV Member', 'Wider library and tools', 'Additional defined services'] },
  { code: 'student', name: 'Student Membership', audience: 'For students, after their student status is checked.', kind: 'individual', sort: 3, student: true, price_cents: 4900, period_months: 12,
    benefits: ['Membership at a student price after a student status check'] },
  { code: 'corporate', name: 'Corporate Membership Package', audience: 'Named memberships bought by an organization for its people. Price per named seat; minimum 5 seats.', kind: 'group', sort: 4, price_cents: 16500, period_months: 12, min_seats: 5,
    benefits: ['Named member seats', 'Invitation and seat management', 'Group invoicing'] },
];

/** Benefit lines: an object { text, available }. Text input: one benefit per line; a line starting with "+" is available now. */
const parseBenefits = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30)
  .map((l) => ({ text: l.replace(/^\+\s*/, '').slice(0, 200), available: l.startsWith('+') }));
const benefitsText = (list) => (list || []).map((b) => `${b.available ? '+ ' : ''}${b.text}`).join('\n');

async function seedProposed() {
  const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM membership_plans');
  if (n) return 0;
  for (const p of PROPOSED) {
    const { rows: [plan] } = await q(`INSERT INTO membership_plans (code, name, audience, kind, sort, min_seats) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING RETURNING id`, [p.code, p.name, p.audience, p.kind, p.sort, p.min_seats || 1]);
    if (plan) await q(`INSERT INTO membership_plan_versions (plan_id, version, benefits, requires_student_check) VALUES ($1, 1, $2, $3)`,
      [plan.id, JSON.stringify(p.benefits.map((t) => ({ text: t, available: false }))), Boolean(p.student)]);
  }
  return PROPOSED.length;
}

/** Writes the proposed starting price and period into drafts that have none yet. Approved terms and edited drafts are never touched. */
async function applyProposedPrices() {
  let n = 0;
  for (const p of PROPOSED) {
    const r = await q(`UPDATE membership_plan_versions v SET price_cents = $2, period_months = $3, terms = CASE WHEN v.terms = '' THEN $4 ELSE v.terms END
      FROM membership_plans pl WHERE pl.id = v.plan_id AND pl.code = $1 AND v.status = 'draft' AND v.price_cents IS NULL AND v.period_months IS NULL
      AND v.version = (SELECT max(version) FROM membership_plan_versions WHERE plan_id = pl.id)`, [p.code, p.price_cents, p.period_months, PROPOSED_TERMS]);
    n += r.rowCount;
  }
  return n;
}
// Draft terms. The refund line stays open until counsel confirms it, so these terms are not ready to approve as they stand.
const PROPOSED_TERMS = [
  'Membership runs for 12 months from the day payment is confirmed.',
  'It does not renew automatically. LIV reminds you 30 days before the end, and you choose whether to renew.',
  'Membership is not a professional credential, does not certify competence, and gives no advantage in eligibility, assessment or any certification decision.',
  'Your LIV credentials stay valid and verifiable whether or not you are a member.',
  'Prices are in US dollars. Benefits are those listed when you join; a later change does not reduce a membership already paid.',
  'Refunds: [TO BE CONFIRMED BY COUNSEL BEFORE SALE].',
].join('\n');

/** Why a plan cannot be bought right now. An empty list means it can. */
function saleBlockers(plan, version, { salesOpen = cfg.membershipSales, purpose = 'individual' } = {}) {
  const out = [];
  if (!salesOpen) out.push('Membership sales are not open yet.');
  if (!plan || plan.status !== 'on_sale') out.push('This plan is not on sale.');
  if (plan && purpose === 'individual' && plan.kind !== 'individual') out.push('This plan is bought as a group pack.');
  if (plan && purpose === 'group' && plan.kind !== 'group') out.push('This plan is not sold as a group pack.');
  if (!version || version.status !== 'approved') out.push('No approved terms for this plan.');
  else {
    if (version.price_cents == null || !version.period_months) out.push('Price or period not approved.');
    if (version.requires_student_check) out.push('The student status check is not available yet.');
    if ((version.benefits || []).some((b) => !b.available)) out.push('Some promised benefits are not available yet.');
    if (!(version.benefits || []).length) out.push('No benefits are defined.');
  }
  return out;
}

/** withDrafts: include plans without approved terms (waitlist, admin). publicOnly: only plans announced on the site or on sale. */
async function plans({ withDrafts = false, publicOnly = false } = {}) {
  const { rows } = await q(`SELECT p.*,
      (SELECT row_to_json(v) FROM membership_plan_versions v WHERE v.plan_id = p.id AND v.status = 'approved' ORDER BY v.version DESC LIMIT 1) AS approved,
      (SELECT row_to_json(v) FROM membership_plan_versions v WHERE v.plan_id = p.id ORDER BY v.version DESC LIMIT 1) AS latest
    FROM membership_plans p ORDER BY p.sort, p.name`);
  return rows.map((p) => ({ ...p, shown: p.approved || (withDrafts ? p.latest : null), blockers: saleBlockers(p, p.approved, { purpose: p.kind }) }))
    .filter((p) => withDrafts || p.approved).filter((p) => !publicOnly || p.announced || p.status === 'on_sale');
}

// The site banner shows the featured plan. Cached for a minute; cleared when a plan's visibility changes.
let bannerCache = { at: 0, value: null };
async function banner() {
  if (Date.now() - bannerCache.at < 60000) return bannerCache.value;
  const { rows: [p] } = await q(`SELECT code, name, status, banner_text FROM membership_plans WHERE featured AND announced AND status <> 'withdrawn' LIMIT 1`);
  bannerCache = { at: Date.now(), value: p ? { code: p.code, name: p.name, open: p.status === 'on_sale', text: p.banner_text } : null };
  return bannerCache.value;
}

/** The main account decides what the site shows: announce a plan (it appears, with its waitlist) and feature one plan in the banner. */
async function setVisibility(user, planId, { announced, featured, banner_text }) {
  await requireMain(user, 'decides which memberships the site shows');
  const text = String(banner_text || '').trim();
  if ([...text].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch))) throw new MembershipError('Write the banner text in English (Latin letters).');
  if (text.length > 160) throw new MembershipError('Keep the banner text to 160 characters.');
  const ann = announced === 'yes'; const feat = featured === 'yes' && ann;
  await tx(async (c) => {
    const { rows: [p] } = await c.query('SELECT code, status FROM membership_plans WHERE id = $1 FOR UPDATE', [planId]);
    if (!p) throw new MembershipError('Plan not found.', 404);
    if (!ann && p.status === 'on_sale') throw new MembershipError('A plan on sale stays visible. Withdraw it from sale first.');
    if (feat) await c.query('UPDATE membership_plans SET featured = false WHERE featured AND id <> $1', [planId]);
    await c.query('UPDATE membership_plans SET announced = $2, featured = $3, banner_text = $4 WHERE id = $1', [planId, ann, feat, text]);
    await audit({ user, action: 'membership.plan_visibility', target: p.code, metadata: { announced: ann, featured: feat } }, c);
  });
  bannerCache = { at: 0, value: null };
}

async function plan(code) { return (await plans({ withDrafts: true })).find((p) => p.code === code) || null; }

async function requireMain(user, what) { if (!(await isMainAccount(user))) throw new MembershipError(`Only the main account ${what}.`, 403); }

/** Saves the draft version of a plan (creates one when the latest version is approved). Prices and terms are entered by LIV staff. */
async function saveDraft(user, planId, f) {
  const price = String(f.price ?? '').trim(); const period = String(f.period_months ?? '').trim();
  if (price && !/^\d{1,6}(\.\d{1,2})?$/.test(price)) throw new MembershipError('Enter the price in US dollars, for example 120 or 120.00, or leave it empty.');
  if (period && !(/^\d+$/.test(period) && +period >= 1 && +period <= 60)) throw new MembershipError('Enter the period in months (1 to 60), or leave it empty.');
  const values = [price ? Math.round(Number(price) * 100) : null, period ? Number(period) : null, JSON.stringify(parseBenefits(f.benefits)), String(f.terms || '').slice(0, 8000), f.requires_student_check === 'yes'];
  return tx(async (c) => {
    const { rows: [latest] } = await c.query('SELECT * FROM membership_plan_versions WHERE plan_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE', [planId]);
    if (!latest) throw new MembershipError('Plan not found.', 404);
    if (latest.status === 'draft') await c.query(`UPDATE membership_plan_versions SET price_cents = $1, period_months = $2, benefits = $3, terms = $4, requires_student_check = $5 WHERE id = $6`, [...values, latest.id]);
    else await c.query(`INSERT INTO membership_plan_versions (plan_id, version, price_cents, period_months, benefits, terms, requires_student_check, created_by) VALUES ($6,$7,$1,$2,$3,$4,$5,$8)`, [...values, planId, latest.version + 1, user.id]);
    await audit({ user, action: 'membership.plan_draft', target: planId }, c);
  });
}

/** The main account approves the draft version. The previous approved version is superseded; memberships keep their own copy. */
async function approve(user, planId) {
  await requireMain(user, 'approves membership terms');
  return tx(async (c) => {
    const { rows: [v] } = await c.query(`SELECT * FROM membership_plan_versions WHERE plan_id = $1 ORDER BY version DESC LIMIT 1 FOR UPDATE`, [planId]);
    if (!v || v.status !== 'draft') throw new MembershipError('There is no draft to approve. Edit the plan to create a new draft.');
    if (v.price_cents == null || !v.period_months) throw new MembershipError('Set a price and a period before approving.');
    if (!v.terms.trim()) throw new MembershipError('Write the terms shown to the buyer before approving.');
    if (/\[TO BE CONFIRMED[^\]]*\]/i.test(v.terms)) throw new MembershipError('Replace every [TO BE CONFIRMED ...] line in the terms before approving.');
    if (!(v.benefits || []).length) throw new MembershipError('List at least one benefit before approving.');
    await c.query(`UPDATE membership_plan_versions SET status = 'superseded' WHERE plan_id = $1 AND status = 'approved'`, [planId]);
    await c.query(`UPDATE membership_plan_versions SET status = 'approved', approved_by = $1, approved_at = now() WHERE id = $2`, [user.id, v.id]);
    await audit({ user, action: 'membership.plan_approve', target: planId, metadata: { version: v.version, price_cents: v.price_cents, period_months: v.period_months } }, c);
  });
}

async function setSale(user, planId, on) {
  await requireMain(user, 'puts a plan on sale or withdraws it');
  const p = (await plans({ withDrafts: true })).find((x) => x.id === planId);
  if (!p) throw new MembershipError('Plan not found.', 404);
  if (on) {
    const blockers = saleBlockers({ ...p, status: 'on_sale' }, p.approved, { salesOpen: true, purpose: p.kind });
    if (blockers.length) throw new MembershipError(`Not ready for sale: ${blockers.join(' ')}`);
  }
  bannerCache = { at: 0, value: null };
  await q(`UPDATE membership_plans SET announced = announced OR $1::varchar = 'on_sale', status = $1::varchar, first_on_sale_at = CASE WHEN $1::varchar = 'on_sale' THEN COALESCE(first_on_sale_at, now()) ELSE first_on_sale_at END WHERE id = $2`, [on ? 'on_sale' : 'withdrawn', planId]);
  await audit({ user, action: on ? 'membership.plan_on_sale' : 'membership.plan_withdrawn', target: p.code });
}

const snapshot = (p, v) => ({ plan_code: p.code, plan_name: p.name, version: v.version, price_cents: v.price_cents, currency: v.currency, period_months: v.period_months, benefits: v.benefits, terms: v.terms });

async function memberNumber(c, userId) {
  const { rows: [m] } = await c.query('SELECT member_number FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1', [userId]);
  if (m) return m.member_number;
  for (;;) {
    const n = `LIVM-${randomCode(8)}`;
    const { rows } = await c.query('SELECT 1 FROM memberships WHERE member_number = $1', [n]);
    if (!rows.length) return n;
  }
}
const event = (c, id, ev, actor, note = '') => c.query('INSERT INTO membership_events (membership_id, event, actor_label, note) VALUES ($1,$2,$3,$4)', [id, ev, actor, String(note).slice(0, 1000)]);

/** The person's current membership (active today), else the most recent one. */
async function current(userId) {
  const { rows } = await q(`SELECT m.*, i.number AS invoice_number, i.status AS invoice_status FROM memberships m LEFT JOIN invoices i ON i.id = m.invoice_id
    WHERE m.user_id = $1 AND m.status <> 'void' ORDER BY (m.status = 'active' AND current_date BETWEEN m.starts_on AND m.ends_on) DESC, m.created_at DESC`, [userId]);
  const active = rows.find((m) => m.status === 'active' && iso(m.starts_on) <= today() && iso(m.ends_on) >= today()) || null;
  return { active, pending: rows.find((m) => m.status === 'pending_payment') || null, history: rows };
}
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const today = () => new Date().toISOString().slice(0, 10);

/** The person takes (or renews) a plan: a pending membership and an invoice at the approved price. Nothing is active until paid. */
async function join(user, code) {
  const p = await plan(code);
  const blockers = saleBlockers(p, p?.approved, { purpose: 'individual' });
  if (blockers.length) throw new MembershipError(blockers.join(' '), 409);
  const v = p.approved;
  const { rows: [u] } = await q(`SELECT id, full_name, email, email_verified_at FROM users WHERE id = $1 AND role = 'individual'`, [user.id]);
  if (!u?.email_verified_at) throw new MembershipError('Confirm your email address before taking a membership.', 403);
  const cur = await current(u.id);
  if (cur.pending) throw new MembershipError('You already have a membership waiting for payment. Pay or cancel it first.', 409);
  const out = await tx(async (c) => {
    const number = await memberNumber(c, u.id);
    const { rows: [inv] } = await c.query(`INSERT INTO invoices (user_id, status, subtotal_cents, total_cents, tax_rate_bps, notes, created_by) VALUES ($1,'draft',$2,$2,0,$3,$1) RETURNING id`,
      [u.id, v.price_cents, `${p.name} membership`]);
    await c.query(`INSERT INTO invoice_lines (invoice_id, product_code, description, quantity, unit_amount_cents, amount_cents) VALUES ($1,'MEMBERSHIP',$2,1,$3::int,$3::bigint)`,
      [inv.id, `${p.name} membership, ${v.period_months} month(s), member ${number}`, v.price_cents]);
    const founding = await require('./waitlist').isFounding(c, u.id, p.id);
    const { rows: [m] } = await c.query(`INSERT INTO memberships (user_id, plan_version_id, member_number, source, status, terms, price_cents, invoice_id, renewed_from)
      VALUES ($1,$2,$3,'paid','pending_payment',$4,$5,$6,$7) RETURNING id`, [u.id, v.id, number, JSON.stringify({ ...snapshot(p, v), founding }), v.price_cents, inv.id, cur.active?.id || null]);
    await event(c, m.id, cur.active ? 'renewal_started' : 'started', u.email, `${p.name} v${v.version}`);
    await audit({ user: u, action: 'membership.start', target: number, metadata: { plan: p.code, version: v.version, invoice: inv.id } }, c);
    return { membershipId: m.id, invoiceId: inv.id };
  });
  const billing = require('./billing-store');
  const issued = await billing.issueInvoice(out.invoiceId);
  if (issued.paid) await onInvoicePaid(out.invoiceId);
  return out;
}

/** Called once an invoice is fully paid. Idempotent: a repeated notice finds no pending membership and changes nothing. */
async function onInvoicePaid(invoiceId) {
  return tx(async (c) => {
    const { rows: [m] } = await c.query(`SELECT m.*, (m.terms->>'period_months')::int AS months FROM memberships m WHERE m.invoice_id = $1 AND m.status = 'pending_payment' FOR UPDATE`, [invoiceId]);
    if (!m) return null;
    let start = today();
    if (m.renewed_from) {
      const { rows: [prev] } = await c.query(`SELECT ends_on FROM memberships WHERE id = $1 AND status = 'active'`, [m.renewed_from]);
      if (prev && iso(prev.ends_on) >= start) { const d = new Date(`${iso(prev.ends_on)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); start = d.toISOString().slice(0, 10); }
    }
    const { rows: [a] } = await c.query(`UPDATE memberships SET status = 'active', activated_at = now(), starts_on = $2::date,
      ends_on = ($2::date + make_interval(months => $3) - interval '1 day')::date WHERE id = $1 RETURNING starts_on, ends_on, member_number`, [m.id, start, m.months]);
    await event(c, m.id, 'activated', 'payment', `Paid invoice; ${iso(a.starts_on)} to ${iso(a.ends_on)}`);
    await require('./waitlist').markJoined(c, m.user_id, m.plan_version_id);
    await audit({ actorLabel: 'payment', action: 'membership.activate', target: a.member_number, metadata: { invoice: invoiceId } }, c);
    return a;
  });
}

/** The person cancels a membership that is still waiting for payment: the invoice is voided, nothing else changes. */
async function cancelPending(user, id) {
  const { rows: [m] } = await q(`SELECT * FROM memberships WHERE id = $1 AND user_id = $2 AND status = 'pending_payment'`, [id, user.id]);
  if (!m) throw new MembershipError('Not found.', 404);
  await require('./billing-store').discardInvoice(m.invoice_id);
  await tx(async (c) => { await c.query(`UPDATE memberships SET status = 'void' WHERE id = $1`, [m.id]); await event(c, m.id, 'cancelled_before_payment', user.email); });
}

/** "I will not renew": recorded on its own; the paid period runs to its end date. Can be undone while active. */
async function setRenewalDeclined(user, id, declined) {
  const { rows: [m] } = await q(`UPDATE memberships SET renewal_declined_at = ${declined ? 'now()' : 'NULL'} WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING id, member_number`, [id, user.id]);
  if (!m) throw new MembershipError('Not found.', 404);
  await q('INSERT INTO membership_events (membership_id, event, actor_label) VALUES ($1,$2,$3)', [m.id, declined ? 'renewal_declined' : 'renewal_restored', user.email]);
  await audit({ user, action: declined ? 'membership.renewal_declined' : 'membership.renewal_restored', target: m.member_number });
}

async function suspend(staff, id, reason, on = true) {
  const why = String(reason || '').trim();
  if (why.length < 5) throw new MembershipError('Record a reason.');
  const { rows: [m] } = await q(`UPDATE memberships SET status = $1, suspended_reason = $2 WHERE id = $3 AND status = $4 RETURNING member_number`,
    [on ? 'suspended' : 'active', on ? why : null, id, on ? 'active' : 'suspended']);
  if (!m) throw new MembershipError(on ? 'Only an active membership can be suspended.' : 'Only a suspended membership can be reinstated.', 409);
  await q('INSERT INTO membership_events (membership_id, event, actor_label, note) VALUES ($1,$2,$3,$4)', [id, on ? 'suspended' : 'reinstated', staff.email, why]);
  await audit({ user: staff, action: on ? 'membership.suspend' : 'membership.reinstate', target: m.member_number, metadata: { reason: why } });
}

/** Daily: active memberships past their end date expire; members are reminded 30 days before the end unless they declined renewal. */
async function sweep() {
  const { rows: expired } = await q(`UPDATE memberships SET status = 'expired' WHERE status = 'active' AND ends_on < current_date RETURNING id`);
  for (const e of expired) await q(`INSERT INTO membership_events (membership_id, event, actor_label) VALUES ($1,'expired','system')`, [e.id]);
  const { rows: due } = await q(`SELECT m.id, m.ends_on, m.terms->>'plan_name' AS plan, u.email, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.status = 'active' AND m.renewal_declined_at IS NULL AND m.ends_on = current_date + 30 AND NOT m.is_preview`);
  const email = require('./email');
  for (const d of due) await email.queue({ to: d.email, name: d.full_name, template: 'membership_reminder', data: { plan: d.plan, ends: iso(d.ends_on) }, dedupeKey: `mrem:${d.id}` });
  return { expired: expired.length, reminded: due.length };
}

/** A preview membership for the preview individual: granted, no payment, never counted as revenue. */
async function grantPreview(staff, userId) {
  const { rows: [v] } = await q(`SELECT v.*, p.code, p.name FROM membership_plan_versions v JOIN membership_plans p ON p.id = v.plan_id
    WHERE p.kind = 'individual' ORDER BY (v.status = 'approved') DESC, p.sort, v.version DESC LIMIT 1`);
  if (!v) throw new MembershipError('No membership plan exists yet.');
  return tx(async (c) => {
    const { rows: [has] } = await c.query(`SELECT id FROM memberships WHERE user_id = $1 AND status = 'active'`, [userId]);
    if (has) return has.id;
    const number = await memberNumber(c, userId);
    const months = v.period_months || 12;
    const { rows: [m] } = await c.query(`INSERT INTO memberships (user_id, plan_version_id, member_number, source, status, terms, price_cents, starts_on, ends_on, is_preview, activated_at)
      VALUES ($1,$2,$3,'grant','active',$4,0,current_date,(current_date + make_interval(months => $5) - interval '1 day')::date,true,now()) RETURNING id`,
    [userId, v.id, number, JSON.stringify({ ...snapshot(v, v), plan_code: v.code, plan_name: v.name, preview: true }), months]);
    await event(c, m.id, 'granted', staff.email, 'Preview membership');
    await audit({ user: staff, action: 'membership.grant_preview', target: number }, c);
    return m.id;
  });
}

/** Public check of a membership card: the minimum. An inactive membership is never confirmed as active. */
async function verifyPublic(number) {
  const n = String(number || '').trim().toUpperCase();
  if (!/^LIVM-[A-Z2-9]{8}$/.test(n)) return { result: 'invalid' };
  const { rows } = await q(`SELECT m.status, m.starts_on, m.ends_on, m.terms->>'plan_name' AS plan, m.is_preview, u.full_name, u.card_show_name
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.member_number = $1 AND m.status IN ('active','expired','suspended','past_due') ORDER BY m.ends_on DESC NULLS LAST`, [n]);
  if (!rows.length) return { result: 'not_found' };
  const now = rows.find((r) => r.status === 'active' && iso(r.starts_on) <= today() && iso(r.ends_on) >= today());
  const base = { number: n, name: rows[0].card_show_name ? rows[0].full_name : null, preview: rows[0].is_preview };
  if (!now) return { result: 'not_active', ...base };
  return { result: 'active', ...base, plan: now.plan, ends_on: iso(now.ends_on) };
}

/** Counts for the admin page. Paid, gifted, trial and granted memberships are kept apart; preview memberships are left out. */
async function stats() {
  const { rows } = await q(`SELECT source, status, count(*)::int AS n, COALESCE(sum(price_cents) FILTER (WHERE source = 'paid' AND status IN ('active','expired')), 0)::bigint AS paid_cents
    FROM memberships WHERE NOT is_preview GROUP BY source, status ORDER BY source, status`);
  return rows;
}

module.exports = { banner, setVisibility, snapshot, memberNumber, iso, today, MembershipError, PROPOSED, PROPOSED_TERMS, applyProposedPrices, parseBenefits, benefitsText, seedProposed, saleBlockers, plans, plan, saveDraft, approve, setSale, current, join, onInvoicePaid, cancelPending, setRenewalDeclined, suspend, sweep, grantPreview, verifyPublic, stats };
