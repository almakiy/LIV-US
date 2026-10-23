// Membership waitlist: people say which plan interests them before it is sold. Free; no payment, no reservation, no guaranteed
// price. Each entry keeps the exact consent text. Invitations go out in batches chosen by the main account, only for a plan that
// can be bought. Anyone on the list before a plan first went on sale becomes a Founding Member when they join it: a badge on the
// membership card, nothing more.
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { isMainAccount } = require('./exceptions');

class WaitlistError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONSENT = 'Email me when this membership opens. This is not a purchase or a reservation, and the price is not guaranteed. I can leave the list at any time.';
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));

/** Adds a person to a plan's list. The same answer whether or not they were already on it. */
async function join({ plan, email, name, country, student, consent, userId }) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new WaitlistError('Enter a valid email address.');
  if (consent !== 'yes') throw new WaitlistError('Confirm that we may email you when the membership opens.');
  if (hasNonLatin(name) || hasNonLatin(country)) throw new WaitlistError('Write your name and country in English (Latin letters).');
  // "any": any future LIV membership. Otherwise an announced plan that is not on sale yet; hidden plans take no entries.
  let p = { id: null, name: 'future LIV memberships' };
  if (String(plan || 'any') !== 'any') {
    ({ rows: [p] } = await q(`SELECT id, name, status, announced FROM membership_plans WHERE code = $1`, [String(plan)]));
    if (!p || !p.announced) throw new WaitlistError('Choose a membership.');
    if (p.status === 'on_sale') throw new WaitlistError('This plan is already open. You can join it from your account.', 409);
  }
  const token = crypto.randomBytes(16).toString('hex');
  const { rows: [row] } = await q(`INSERT INTO membership_waitlist (plan_id, email, name, country, is_student, user_id, consent_text, leave_token)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email)) WHERE status <> 'left' DO NOTHING RETURNING id`,
  [p.id, e, String(name || '').trim().slice(0, 200), String(country || '').trim().slice(0, 80), student === 'yes' ? true : null, userId || null, CONSENT, token]);
  if (row) {
    await require('./email').queue({ to: e, name: name || null, template: 'waitlist_joined', data: { plan: p.name, token }, dedupeKey: `wl:${row.id}` });
    await audit({ actorLabel: e, action: 'waitlist.join', target: p.name });
  }
  return p;
}

async function leave(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const { rows: [r] } = await q(`UPDATE membership_waitlist SET status = 'left', left_at = now() WHERE leave_token = $1 AND status IN ('waiting','invited') RETURNING id, email`, [token]);
  if (r) await audit({ actorLabel: r.email, action: 'waitlist.leave', target: r.id });
  return r || null;
}

/** True when the person was on this plan's list before the plan first went on sale. Runs inside the join transaction. */
async function isFounding(c, userId, planId) {
  const { rows: [r] } = await c.query(`SELECT 1 FROM membership_waitlist w JOIN membership_plans p ON p.id = w.plan_id
    WHERE w.plan_id = $2 AND w.status IN ('waiting','invited','joined') AND p.first_on_sale_at IS NOT NULL AND w.created_at < p.first_on_sale_at
      AND lower(w.email) IN (SELECT lower(email) FROM users WHERE id = $1 AND email_verified_at IS NOT NULL
                             UNION SELECT lower(email) FROM individual_emails WHERE user_id = $1 AND verified_at IS NOT NULL)`, [userId, planId]);
  return Boolean(r);
}

async function markJoined(c, userId, versionId) {
  await c.query(`UPDATE membership_waitlist w SET status = 'joined', joined_at = now() FROM membership_plan_versions v
    WHERE v.id = $2 AND w.plan_id = v.plan_id AND w.status IN ('waiting','invited')
      AND lower(w.email) IN (SELECT lower(email) FROM users WHERE id = $1 UNION SELECT lower(email) FROM individual_emails WHERE user_id = $1 AND verified_at IS NOT NULL)`, [userId, versionId]);
}

/** The main account invites the oldest waiting people on one plan, in a batch of the chosen size, once the plan can be bought. */
async function inviteBatch(user, planCode, size) {
  if (!(await isMainAccount(user))) throw new WaitlistError('Only the main account sends waitlist invitations.', 403);
  const n = parseInt(size, 10);
  if (!(n >= 1 && n <= 1000)) throw new WaitlistError('Choose a batch of 1 to 1000 people.');
  const M = require('./memberships');
  const p = await M.plan(String(planCode || ''));
  if (!p) throw new WaitlistError('Choose a plan.');
  const blockers = M.saleBlockers(p, p.approved, { purpose: p.kind });
  if (blockers.length) throw new WaitlistError(`Invitations wait until the plan can be bought: ${blockers.join(' ')}`, 409);
  const batch = crypto.randomUUID();
  const people = await tx(async (c) => {
    const { rows } = await c.query(`UPDATE membership_waitlist SET status = 'invited', invited_at = now(), invite_batch = $3
      WHERE id IN (SELECT id FROM membership_waitlist WHERE plan_id = $1 AND status = 'waiting' ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING id, email, name, leave_token`, [p.id, n, batch]);
    return rows;
  });
  const email = require('./email');
  for (const w of people) await email.queue({ to: w.email, name: w.name || null, template: 'waitlist_invite', data: { plan: p.name, token: w.leave_token }, dedupeKey: `wli:${w.id}` });
  await audit({ user, action: 'waitlist.invite', target: p.code, metadata: { batch, invited: people.length } });
  return people.length;
}

async function stats() {
  const [byPlan, byCountry, weekly] = await Promise.all([
    q(`SELECT p.sort, p.code, p.name, p.status AS plan_status, count(w.id) FILTER (WHERE w.status = 'waiting')::int AS waiting, count(w.id) FILTER (WHERE w.status = 'invited')::int AS invited,
         count(w.id) FILTER (WHERE w.status = 'joined')::int AS joined, count(w.id) FILTER (WHERE w.status = 'left')::int AS left_list,
         count(w.id) FILTER (WHERE w.is_student AND w.status <> 'left')::int AS students
       FROM membership_plans p LEFT JOIN membership_waitlist w ON w.plan_id = p.id GROUP BY p.id
     UNION ALL SELECT 999, 'any', 'Any future membership', '', count(*) FILTER (WHERE status = 'waiting')::int, count(*) FILTER (WHERE status = 'invited')::int,
       count(*) FILTER (WHERE status = 'joined')::int, count(*) FILTER (WHERE status = 'left')::int, count(*) FILTER (WHERE is_student AND status <> 'left')::int
       FROM membership_waitlist WHERE plan_id IS NULL ORDER BY 1`),
    q(`SELECT COALESCE(NULLIF(country, ''), 'Not given') AS country, count(*)::int AS n FROM membership_waitlist WHERE status <> 'left' GROUP BY 1 ORDER BY n DESC, 1 LIMIT 30`),
    q(`SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, count(*)::int AS n FROM membership_waitlist GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
  ]);
  return { byPlan: byPlan.rows, byCountry: byCountry.rows, weekly: weekly.rows };
}

async function exportRows() {
  return (await q(`SELECT w.created_at, COALESCE(p.name, 'Any future membership') AS plan, w.email, w.name, w.country, w.is_student, w.status, w.invited_at, w.joined_at FROM membership_waitlist w
    LEFT JOIN membership_plans p ON p.id = w.plan_id ORDER BY w.created_at`)).rows;
}

module.exports = { WaitlistError, CONSENT, join, leave, isFounding, markJoined, inviteBatch, stats, exportRows };
