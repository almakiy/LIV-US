// Individuals portal M4: gifted memberships and group packs.
// - Paid gift: a person buys a membership for a named recipient (plan on sale, approved terms). After payment the recipient gets a
//   one-use code. LIV launch campaign: staff issue gifts inside a campaign the main account approved (plan, months, number,
//   last acceptance date); issuing within it is an ordinary delegated task.
// - Group pack: an organization's manager buys named seats of a group plan and invites people. The manager handles seats,
//   invitations and invoices only; members' accounts, credentials and records stay theirs and are never shown to the manager.
// A gift or a seat gives a membership for a fixed period. It never starts a paid subscription or an automatic renewal, and its
// nominal value is not revenue: only money actually paid (the gift purchase or the pack invoice) is.
const crypto = require('crypto');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { isMainAccount } = require('./exceptions');
const M = require('./memberships');

class GiftError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const hash = (code) => crypto.createHash('sha256').update(String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
const newCode = () => { const { randomCode } = require('./crypto'); return `GIFT-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`; };
const addDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ACCEPT_DAYS = 90; // last acceptance date of a paid gift

async function verifiedEmails(userId) {
  const { rows } = await q(`SELECT lower(email) AS e FROM users WHERE id = $1 AND email_verified_at IS NOT NULL
    UNION SELECT lower(email) FROM individual_emails WHERE user_id = $1 AND verified_at IS NOT NULL`, [userId]);
  return rows.map((r) => r.e);
}

/** Creates the membership a gift or a seat gives, inside the caller's transaction. Starts today, or after the current membership. */
async function grantMembership(c, { userId, versionId, terms, months, endsOn = null, source, note }) {
  const { rows: [cur] } = await c.query(`SELECT id, ends_on FROM memberships WHERE user_id = $1 AND status = 'active' AND current_date BETWEEN starts_on AND ends_on ORDER BY ends_on DESC LIMIT 1`, [userId]);
  const number = await M.memberNumber(c, userId);
  // A gift continues after the current membership; a seat runs with its pack from today.
  const follow = cur && source !== 'group';
  const start = follow ? `(DATE '${M.iso(cur.ends_on)}' + 1)` : 'current_date';
  const end = endsOn ? '$6::date' : `(${start} + make_interval(months => $6::int) - interval '1 day')::date`;
  const { rows: [m] } = await c.query(`INSERT INTO memberships (user_id, plan_version_id, member_number, source, status, terms, price_cents, starts_on, ends_on, renewed_from, activated_at)
    VALUES ($1,$2,$3,$4,'active',$5,0,${start},${end},$7,now()) RETURNING id, starts_on, ends_on`,
  [userId, versionId, number, source, JSON.stringify(terms), endsOn || months, follow ? cur.id : null]);
  await c.query('INSERT INTO membership_events (membership_id, event, actor_label, note) VALUES ($1,$2,$3,$4)', [m.id, source === 'group' ? 'seat_accepted' : 'gift_accepted', 'recipient', note]);
  return m;
}

// ---------- Paid gifts ----------
async function buyGift(user, { plan: code, recipient_email, recipient_name }) {
  const p = await M.plan(String(code || ''));
  const blockers = M.saleBlockers(p, p?.approved, { purpose: 'individual' });
  if (blockers.length) throw new GiftError(blockers.join(' '), 409);
  const to = String(recipient_email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new GiftError("Enter the recipient's email address.");
  const v = p.approved;
  const billing = require('./billing-store');
  const out = await tx(async (c) => {
    const inv = await billing.createIndividualDraft(c, { userId: user.id, code: 'MEMBERSHIP_GIFT', description: `Gift: ${p.name} membership, ${v.period_months} month(s), for ${to}`, cents: v.price_cents, notes: 'Membership gift' });
    const code_ = newCode();
    const { rows: [g] } = await c.query(`INSERT INTO gifts (code_hash, code_last4, kind, plan_id, months, terms, buyer_user_id, recipient_email, recipient_name, price_cents, invoice_id, status, accept_by, created_by)
      VALUES ($1,$2,'paid',$3,$4,$5,$6,$7,$8,$9,$10,'pending_payment',$11,$6) RETURNING id`,
    [hash(code_), code_.slice(-4), p.id, v.period_months, JSON.stringify({ ...M.snapshot(p, v), version_id: v.id }), user.id, to, String(recipient_name || '').slice(0, 200), v.price_cents, inv, addDays(ACCEPT_DAYS)]);
    await audit({ user, action: 'gift.order', target: g.id, metadata: { plan: p.code } }, c);
    return { giftId: g.id, invoiceId: inv };
  });
  const issued = await billing.issueInvoice(out.invoiceId);
  if (issued.paid) await onInvoicePaid(out.invoiceId);
  return out;
}

/** After payment: the gift is issued with a fresh code sent to the recipient. Idempotent. Also activates group packs. */
async function onInvoicePaid(invoiceId) {
  const { rows: [g] } = await q(`SELECT g.*, u.full_name AS buyer FROM gifts g LEFT JOIN users u ON u.id = g.buyer_user_id WHERE g.invoice_id = $1 AND g.status = 'pending_payment'`, [invoiceId]);
  if (g) {
    const code = newCode();
    // The acceptance window starts when the gift is paid and issued, so a late payment never shortens it.
    const { rows: [issued] } = await q(`UPDATE gifts SET status = 'issued', code_hash = $2, code_last4 = $3, accept_by = $4 WHERE id = $1 AND status = 'pending_payment' RETURNING accept_by`,
      [g.id, hash(code), code.slice(-4), addDays(ACCEPT_DAYS)]);
    if (issued) {
      await require('./email').queue({ to: g.recipient_email, name: g.recipient_name || null, template: 'gift_received', data: { from: g.buyer, plan: g.terms.plan_name, months: g.months, code, acceptBy: M.iso(issued.accept_by) }, dedupeKey: `gift:${g.id}` });
      await audit({ actorLabel: 'payment', action: 'gift.issue', target: g.id });
    }
  }
  const { rows: [pk] } = await q(`UPDATE group_packs SET status = 'active', activated_at = now(), starts_on = current_date,
      ends_on = (current_date + make_interval(months => (terms->>'period_months')::int) - interval '1 day')::date
    WHERE invoice_id = $1 AND status = 'pending_payment' RETURNING id`, [invoiceId]);
  if (pk) await audit({ actorLabel: 'payment', action: 'group.activate', target: pk.id });
  return { gift: g?.id || null, pack: pk?.id || null };
}

/** The buyer asks to send the gift again: a new code replaces the old one, which stops working. */
async function resendGift(user, id) {
  const { rows: [g] } = await q(`SELECT g.*, u.full_name AS buyer FROM gifts g LEFT JOIN users u ON u.id = g.buyer_user_id WHERE g.id = $1 AND g.buyer_user_id = $2 AND g.status = 'issued' AND g.accept_by >= current_date`, [id, user.id]);
  if (!g) throw new GiftError('Only an unused, unexpired gift can be sent again.', 404);
  const code = newCode();
  await q('UPDATE gifts SET code_hash = $2, code_last4 = $3 WHERE id = $1', [g.id, hash(code), code.slice(-4)]);
  await require('./email').queue({ to: g.recipient_email, name: g.recipient_name || null, template: 'gift_received', data: { from: g.buyer, plan: g.terms.plan_name, months: g.months, code, acceptBy: M.iso(g.accept_by) } });
  await audit({ user, action: 'gift.resend', target: g.id });
}

// ---------- Launch campaigns ----------
async function saveCampaign(user, f) {
  const name = String(f.name || '').trim(); const months = +f.months; const max = +f.max_gifts; const acceptBy = String(f.accept_by || '');
  if (name.length < 3) throw new GiftError('Name the campaign.');
  if (!(months >= 1 && months <= 24) || !(max >= 1 && max <= 10000)) throw new GiftError('Months: 1 to 24. Number of gifts: 1 to 10000.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptBy) || acceptBy < new Date().toISOString().slice(0, 10)) throw new GiftError('Set a last acceptance date in the future.');
  const { rows: [p] } = await q(`SELECT id FROM membership_plans WHERE code = $1 AND kind = 'individual'`, [f.plan]);
  if (!p) throw new GiftError('Choose an individual plan.');
  const { rows: [cmp] } = await q('INSERT INTO gift_campaigns (name, purpose, plan_id, months, max_gifts, accept_by, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [name.slice(0, 200), String(f.purpose || '').slice(0, 2000), p.id, months, max, acceptBy, user.id]);
  await audit({ user, action: 'gift.campaign_draft', target: cmp.id });
  return cmp.id;
}
async function approveCampaign(user, id) {
  if (!(await isMainAccount(user))) throw new GiftError('Only the main account approves a gift campaign (its budget and rules).', 403);
  const { rowCount } = await q(`UPDATE gift_campaigns SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1 AND status = 'draft'`, [id, user.id]);
  if (!rowCount) throw new GiftError('Only a draft campaign can be approved.');
  await audit({ user, action: 'gift.campaign_approve', target: id });
}
async function closeCampaign(user, id) {
  await q(`UPDATE gift_campaigns SET status = 'closed' WHERE id = $1`, [id]);
  await audit({ user, action: 'gift.campaign_close', target: id });
}

/** Staff issue a campaign gift to one recipient. Returns the code once (for a live session or a manual hand-over). */
async function issueCampaignGift(staff, campaignId, { recipient_email, recipient_name, not_assessor }) {
  if (not_assessor !== 'yes') throw new GiftError('Confirm the recipient does not assess or decide LIV authorization requests.');
  const to = String(recipient_email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new GiftError("Enter the recipient's email address.");
  return tx(async (c) => {
    const { rows: [cmp] } = await c.query(`SELECT g.*, p.code AS plan_code, p.name AS plan_name FROM gift_campaigns g JOIN membership_plans p ON p.id = g.plan_id WHERE g.id = $1 FOR UPDATE OF g`, [campaignId]);
    if (!cmp || cmp.status !== 'approved') throw new GiftError('Gifts are issued only from an approved campaign.', 409);
    if (M.iso(cmp.accept_by) < new Date().toISOString().slice(0, 10)) throw new GiftError('This campaign has passed its last acceptance date.', 409);
    const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM gifts WHERE campaign_id = $1 AND status <> 'revoked'`, [cmp.id]);
    if (n >= cmp.max_gifts) throw new GiftError('The campaign has issued all its gifts.', 409);
    const { rows: [dup] } = await c.query(`SELECT 1 FROM gifts WHERE campaign_id = $1 AND recipient_email = $2 AND status IN ('issued','accepted')`, [cmp.id, to]);
    if (dup) throw new GiftError('This person already has a gift from this campaign.', 409);
    const { rows: [v] } = await c.query(`SELECT * FROM membership_plan_versions WHERE plan_id = $1 ORDER BY (status = 'approved') DESC, version DESC LIMIT 1`, [cmp.plan_id]);
    const code = newCode();
    const { rows: [g] } = await c.query(`INSERT INTO gifts (code_hash, code_last4, kind, plan_id, months, terms, campaign_id, recipient_email, recipient_name, status, accept_by, created_by)
      VALUES ($1,$2,'campaign',$3,$4,$5,$6,$7,$8,'issued',$9,$10) RETURNING id`,
    [hash(code), code.slice(-4), cmp.plan_id, cmp.months, JSON.stringify({ plan_code: cmp.plan_code, plan_name: cmp.plan_name, period_months: cmp.months, benefits: v?.benefits || [], terms: v?.terms || '', version_id: v?.id, campaign: cmp.name }), cmp.id, to, String(recipient_name || '').slice(0, 200), cmp.accept_by, staff.id]);
    await require('./email').queue({ to, name: recipient_name || null, template: 'gift_received', data: { from: 'LIV', plan: cmp.plan_name, months: cmp.months, code, acceptBy: M.iso(cmp.accept_by) }, dedupeKey: `gift:${g.id}` });
    await audit({ user: staff, action: 'gift.campaign_issue', target: g.id, metadata: { campaign: cmp.id } }, c);
    return { id: g.id, code };
  });
}

async function revokeGift(staff, id, reason) {
  const why = String(reason || '').trim(); if (why.length < 5) throw new GiftError('Record a reason.');
  const { rowCount } = await q(`UPDATE gifts SET status = 'revoked' WHERE id = $1 AND status = 'issued'`, [id]);
  if (!rowCount) throw new GiftError('Only an unused gift can be revoked.');
  await audit({ user: staff, action: 'gift.revoke', target: id, metadata: { reason: why } });
}

// ---------- Accepting a gift or a seat ----------
/** One-use: the code is consumed in the same statement that checks it, so a repeated or parallel attempt grants nothing. */
async function redeem(user, rawCode) {
  const h = hash(rawCode);
  const emails = await verifiedEmails(user.id);
  if (!emails.length) throw new GiftError('Confirm your email address first.', 403);
  return tx(async (c) => {
    const { rows: [g] } = await c.query(`SELECT * FROM gifts WHERE code_hash = $1 FOR UPDATE`, [h]);
    if (g) {
      if (g.status !== 'issued' || M.iso(g.accept_by) < new Date().toISOString().slice(0, 10)) throw new GiftError('This code has already been used, has expired or was withdrawn.', 409);
      if (!emails.includes(g.recipient_email)) throw new GiftError('This gift is for another email address. Add and confirm that address in your account first.', 403);
      const m = await grantMembership(c, { userId: user.id, versionId: g.terms.version_id || (await c.query(`SELECT id FROM membership_plan_versions WHERE plan_id = $1 ORDER BY version DESC LIMIT 1`, [g.plan_id])).rows[0].id,
        terms: { ...g.terms, gift: g.id, period_months: g.months }, months: g.months, source: 'gift', note: g.kind === 'campaign' ? `Campaign gift ${g.terms.campaign || ''}` : 'Paid gift' });
      await c.query(`UPDATE gifts SET status = 'accepted', accepted_user_id = $2, membership_id = $3, accepted_at = now() WHERE id = $1`, [g.id, user.id, m.id]);
      await audit({ user, action: 'gift.accept', target: g.id }, c);
      return { kind: 'gift', membership: m };
    }
    const { rows: [s] } = await c.query(`SELECT st.*, gp.status AS pack_status, gp.ends_on, gp.plan_version_id, gp.terms, gp.org_name FROM group_seats st JOIN group_packs gp ON gp.id = st.pack_id WHERE st.code_hash = $1 FOR UPDATE OF st`, [h]);
    if (!s) throw new GiftError('This code is not valid.', 404);
    if (s.status !== 'invited' || s.pack_status !== 'active' || M.iso(s.ends_on) < new Date().toISOString().slice(0, 10)) throw new GiftError('This invitation has already been used, was withdrawn, or its pack is not active.', 409);
    if (!emails.includes(s.email.toLowerCase())) throw new GiftError('This invitation is for another email address. Add and confirm that address in your account first.', 403);
    const m = await grantMembership(c, { userId: user.id, versionId: s.plan_version_id, terms: { ...s.terms, group_pack: s.pack_id, organization: s.org_name }, endsOn: M.iso(s.ends_on), source: 'group', note: `Seat from ${s.org_name}` });
    await c.query(`UPDATE group_seats SET status = 'accepted', user_id = $2, membership_id = $3, accepted_at = now() WHERE id = $1`, [s.id, user.id, m.id]);
    await audit({ user, action: 'group.seat_accept', target: s.id }, c);
    return { kind: 'seat', membership: m };
  });
}

// ---------- Group packs ----------
async function buyPack(user, { plan: code, org_name, seats }) {
  const p = await M.plan(String(code || ''));
  const blockers = M.saleBlockers(p, p?.approved, { purpose: 'group' });
  if (blockers.length) throw new GiftError(blockers.join(' '), 409);
  const org = String(org_name || '').trim(); const n = parseInt(seats, 10);
  if (org.length < 2) throw new GiftError("Enter the organization's name.");
  if ([...org].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch))) throw new GiftError("Write the organization's name in English (Latin letters).");
  if (!(n >= p.min_seats && n <= 1000)) throw new GiftError(`Choose between ${p.min_seats} and 1000 seats.`);
  const v = p.approved; const total = v.price_cents * n;
  const billing = require('./billing-store');
  const out = await tx(async (c) => {
    const inv = await billing.createIndividualDraft(c, { userId: user.id, code: 'MEMBERSHIP_GROUP', description: `${p.name}: ${n} named seat(s) for ${org}, ${v.period_months} month(s)`, cents: total, notes: org });
    const { rows: [pk] } = await c.query(`INSERT INTO group_packs (manager_user_id, org_name, plan_version_id, seats, seat_price_cents, terms, invoice_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_payment') RETURNING id`,
      [user.id, org.slice(0, 200), v.id, n, v.price_cents, JSON.stringify(M.snapshot(p, v)), inv]);
    await audit({ user, action: 'group.order', target: pk.id, metadata: { seats: n } }, c);
    return { packId: pk.id, invoiceId: inv };
  });
  const issued = await billing.issueInvoice(out.invoiceId);
  if (issued.paid) await onInvoicePaid(out.invoiceId);
  return out;
}

async function ownPack(user, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows: [pk] } = await q('SELECT * FROM group_packs WHERE id = $1 AND manager_user_id = $2', [id, user.id]);
  return pk || null;
}
/** What the manager sees: seat status and contact only. Never the member's credentials, membership history or records. */
async function seats(packId) {
  return (await q(`SELECT id, email, status FROM group_seats WHERE pack_id = $1 ORDER BY invited_at`, [packId])).rows;
}

async function invite(user, packId, { email, name }) {
  const to = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new GiftError('Enter a valid email address.');
  return tx(async (c) => {
    const { rows: [pk] } = await c.query(`SELECT * FROM group_packs WHERE id = $1 AND manager_user_id = $2 FOR UPDATE`, [packId, user.id]);
    if (!pk) throw new GiftError('Not found.', 404);
    if (pk.status !== 'active') throw new GiftError('Seats can be assigned once the pack is paid and active.', 409);
    const { rows: [{ used }] } = await c.query(`SELECT count(*)::int AS used FROM group_seats WHERE pack_id = $1 AND status <> 'revoked'`, [pk.id]);
    if (used >= pk.seats) throw new GiftError('All seats are assigned. Withdraw an invitation or a seat to free one.', 409);
    const code = newCode();
    try {
      await c.query(`INSERT INTO group_seats (pack_id, email, name, code_hash) VALUES ($1,$2,$3,$4)`, [pk.id, to, String(name || '').slice(0, 200), hash(code)]);
    } catch (e) { if (e.code === '23505') throw new GiftError('This address already has a seat in this pack.', 409); throw e; }
    await require('./email').queue({ to, name: name || null, template: 'seat_invite', data: { org: pk.org_name, plan: pk.terms.plan_name, code } });
    await audit({ user, action: 'group.invite', target: pk.id }, c);
    return code;
  });
}

/** Withdraws an invitation, or ends an accepted seat today (the seat can then be given to someone else). The member's account stays. */
async function revokeSeat(user, packId, seatId) {
  return tx(async (c) => {
    const { rows: [s] } = await c.query(`SELECT st.* FROM group_seats st JOIN group_packs gp ON gp.id = st.pack_id WHERE st.id = $1 AND st.pack_id = $2 AND gp.manager_user_id = $3 FOR UPDATE OF st`, [seatId, packId, user.id]);
    if (!s || s.status === 'revoked') throw new GiftError('Not found.', 404);
    if (s.membership_id) {
      await c.query(`UPDATE memberships SET status = 'expired', ends_on = LEAST(ends_on, current_date - 1) WHERE id = $1 AND status = 'active'`, [s.membership_id]);
      await c.query(`INSERT INTO membership_events (membership_id, event, actor_label, note) VALUES ($1,'seat_ended','group manager','Seat withdrawn by the organization')`, [s.membership_id]);
    }
    await c.query(`UPDATE group_seats SET status = 'revoked', revoked_at = now() WHERE id = $1`, [s.id]);
    await audit({ user, action: 'group.seat_revoke', target: s.id }, c);
  });
}

async function giftsBought(userId) { return (await q(`SELECT g.id, g.recipient_email, g.status, g.accept_by, g.code_last4, g.terms->>'plan_name' AS plan, g.invoice_id FROM gifts g WHERE g.buyer_user_id = $1 ORDER BY g.created_at DESC`, [userId])).rows; }
async function packsManaged(userId) {
  return (await q(`SELECT gp.*, (SELECT count(*)::int FROM group_seats s WHERE s.pack_id = gp.id AND s.status <> 'revoked') AS used,
    (SELECT count(*)::int FROM group_seats s WHERE s.pack_id = gp.id AND s.status = 'accepted') AS accepted FROM group_packs gp WHERE gp.manager_user_id = $1 AND gp.status <> 'void' ORDER BY gp.created_at DESC`, [userId])).rows;
}
async function adminOverview() {
  const [campaigns, gifts, packs] = await Promise.all([
    q(`SELECT c.*, p.name AS plan_name, (SELECT count(*)::int FROM gifts g WHERE g.campaign_id = c.id AND g.status <> 'revoked') AS issued,
       (SELECT count(*)::int FROM gifts g WHERE g.campaign_id = c.id AND g.status = 'accepted') AS accepted FROM gift_campaigns c JOIN membership_plans p ON p.id = c.plan_id ORDER BY c.created_at DESC`),
    q(`SELECT g.id, g.kind, g.recipient_email, g.status, g.accept_by, g.code_last4, g.price_cents, g.terms->>'plan_name' AS plan FROM gifts g ORDER BY g.created_at DESC LIMIT 200`),
    q(`SELECT gp.id, gp.org_name, gp.seats, gp.status, gp.ends_on, gp.seat_price_cents, u.email AS manager,
       (SELECT count(*)::int FROM group_seats s WHERE s.pack_id = gp.id AND s.status = 'accepted') AS accepted FROM group_packs gp JOIN users u ON u.id = gp.manager_user_id ORDER BY gp.created_at DESC LIMIT 200`),
  ]);
  return { campaigns: campaigns.rows, gifts: gifts.rows, packs: packs.rows };
}

/** Daily: unused gifts past their last acceptance date expire; packs past their end date expire (members' seats end with them). */
async function sweep() {
  await q(`UPDATE gifts SET status = 'expired' WHERE status = 'issued' AND accept_by < current_date`);
  await q(`UPDATE group_packs SET status = 'expired' WHERE status = 'active' AND ends_on < current_date`);
}

module.exports = { GiftError, hash, buyGift, onInvoicePaid, resendGift, saveCampaign, approveCampaign, closeCampaign, issueCampaignGift, revokeGift, redeem, buyPack, ownPack, seats, invite, revokeSeat, giftsBought, packsManaged, adminOverview, sweep };
