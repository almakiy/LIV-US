// Individuals portal M3: communication consents, newsletter issues, community events and contributions.
// Consents: two separate, optional choices (knowledge newsletter, offers), never pre-ticked, each change kept with its source and
// the exact text shown. Service messages (account, credentials, invoices, membership) are sent whatever the person chooses.
// Newsletter issues are written and approved in the admin; sending is closed until NEWSLETTER_SENDING is on, and only the main
// account queues an issue. Events: registration is checked on the server (audience, capacity, date). Contributions are proposals:
// accepting one never makes the person an expert, and a name is shown only with their consent.
const crypto = require('crypto');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { isMainAccount } = require('./exceptions');

class CommunityError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const hasNonLatin = (v) => [...String(v ?? '')].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));

const CONSENT_TEXT = {
  newsletter: 'Send me the LIV knowledge newsletter on the topics I choose. Optional; I can stop it at any time.',
  offers: 'Send me offers about LIV products, services and events. Optional; I can stop it at any time.',
};
const TOPICS = { governance: 'Governance', safety: 'Safety and health', quality: 'Quality', environment: 'Environment', project: 'Project management', credentialing: 'Professional credentialing' };
const COLUMN = { newsletter: 'newsletter_opt_in', offers: 'marketing_opt_in' };

async function ensureToken(userId) {
  const { rows: [u] } = await q('SELECT comm_token FROM users WHERE id = $1', [userId]);
  if (u?.comm_token) return u.comm_token;
  const t = crypto.randomBytes(16).toString('hex');
  await q('UPDATE users SET comm_token = $1 WHERE id = $2 AND comm_token IS NULL', [t, userId]);
  return (await q('SELECT comm_token FROM users WHERE id = $1', [userId])).rows[0].comm_token;
}

/** Records a consent choice when it changes. Returns true when something changed. */
async function setConsent(userId, channel, granted, source, client) {
  if (!COLUMN[channel]) throw new CommunityError('Unknown channel.');
  const run = client ? client.query.bind(client) : q;
  const col = COLUMN[channel];
  const { rowCount } = await run(`UPDATE users SET ${col} = $1${channel === 'offers' ? ', marketing_opt_in_at = now()' : ''} WHERE id = $2 AND ${col} IS DISTINCT FROM $1`, [Boolean(granted), userId]);
  if (!rowCount) return false;
  await run('INSERT INTO communication_consents (user_id, channel, granted, source, text_shown) VALUES ($1,$2,$3,$4,$5)', [userId, channel, Boolean(granted), String(source).slice(0, 40), CONSENT_TEXT[channel]]);
  return true;
}

async function setTopics(userId, topics) {
  const list = [].concat(topics || []).filter((t) => TOPICS[t]).slice(0, Object.keys(TOPICS).length);
  await q('UPDATE users SET newsletter_topics = $1 WHERE id = $2', [list, userId]);
  return list;
}

/** Public unsubscribe link: stops one channel; the account and service messages are unaffected. */
async function unsubscribe(token, channel) {
  if (!/^[a-f0-9]{32}$/.test(String(token || '')) || !COLUMN[channel]) return null;
  const { rows: [u] } = await q('SELECT id, email FROM users WHERE comm_token = $1', [token]);
  if (!u) return null;
  await setConsent(u.id, channel, false, 'unsubscribe link');
  return u;
}

async function consentHistory(userId) {
  return (await q('SELECT channel, granted, source, text_shown, created_at FROM communication_consents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId])).rows;
}

// ---------- Newsletter ----------
async function saveIssue(user, id, f) {
  const subject = String(f.subject || '').trim(); const body = String(f.body_md || '').trim();
  if (subject.length < 3 || body.length < 20) throw new CommunityError('Write a subject and a body of at least 20 characters.');
  if (hasNonLatin(subject) || hasNonLatin(body)) throw new CommunityError('Write the issue in English (Latin letters).');
  const topics = [].concat(f.topics || []).filter((t) => TOPICS[t]);
  if (id) {
    const { rowCount } = await q(`UPDATE newsletter_issues SET subject = $1, body_md = $2, topics = $3, status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = $4 AND status <> 'queued'`, [subject.slice(0, 200), body.slice(0, 20000), topics, id]);
    if (!rowCount) throw new CommunityError('A queued issue cannot be changed.');
    return id;
  }
  const { rows: [r] } = await q('INSERT INTO newsletter_issues (subject, body_md, topics, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [subject.slice(0, 200), body.slice(0, 20000), topics, user.id]);
  await audit({ user, action: 'newsletter.draft', target: r.id });
  return r.id;
}

async function approveIssue(user, id) {
  const { rows: [i] } = await q('SELECT * FROM newsletter_issues WHERE id = $1', [id]);
  if (!i || i.status !== 'draft') throw new CommunityError('Only a draft can be approved.');
  if (i.created_by === user.id && !(await isMainAccount(user))) throw new CommunityError('A different person approves the issue.', 403);
  await q(`UPDATE newsletter_issues SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [id, user.id]);
  await audit({ user, action: 'newsletter.approve', target: id });
}

/** Who would receive an issue: confirmed individual accounts that chose the newsletter and one of its topics (no topic chosen = all). */
const AUDIENCE = `FROM users u WHERE u.role = 'individual' AND u.newsletter_opt_in AND u.email_verified_at IS NOT NULL AND u.disabled_at IS NULL AND NOT u.is_preview
  AND (cardinality($1::text[]) = 0 OR cardinality(u.newsletter_topics) = 0 OR u.newsletter_topics && $1::text[])`;
async function audienceCount(topics) { return (await q(`SELECT count(*)::int AS n ${AUDIENCE}`, [topics || []])).rows[0].n; }

async function queueIssue(user, id) {
  if (!cfg.newsletterSending) throw new CommunityError('Newsletter sending is not open yet (sending domain and footer to be confirmed).', 409);
  if (!(await isMainAccount(user))) throw new CommunityError('Only the main account sends a newsletter issue.', 403);
  const { rows: [i] } = await q('SELECT * FROM newsletter_issues WHERE id = $1', [id]);
  if (!i || i.status !== 'approved') throw new CommunityError('Only an approved issue can be sent.');
  const { rows: people } = await q(`SELECT u.id, u.email, u.full_name ${AUDIENCE}`, [i.topics]);
  const email = require('./email');
  for (const p of people) {
    const token = await ensureToken(p.id);
    await email.queue({ to: p.email, name: p.full_name, template: 'newsletter', data: { subject: i.subject, body: i.body_md, token }, dedupeKey: `nl:${i.id}:${p.id}` });
  }
  await q(`UPDATE newsletter_issues SET status = 'queued', queued_at = now(), recipients = $2 WHERE id = $1`, [id, people.length]);
  await audit({ user, action: 'newsletter.queue', target: id, metadata: { recipients: people.length } });
  return people.length;
}

// ---------- Events ----------
async function saveEvent(user, id, f) {
  const title = String(f.title || '').trim(); const summary = String(f.summary || '').trim();
  if (title.length < 3) throw new CommunityError('Enter a title.');
  if (hasNonLatin(title) || hasNonLatin(summary)) throw new CommunityError('Write the event in English (Latin letters).');
  const starts = new Date(f.starts_at); const ends = new Date(f.ends_at);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) throw new CommunityError('Enter a start and an end time; the end comes after the start.');
  const cap = String(f.capacity || '').trim(); if (cap && !(/^\d+$/.test(cap) && +cap > 0)) throw new CommunityError('Capacity: a whole number, or empty for no limit.');
  const url = String(f.join_url || '').trim(); if (url && !/^https:\/\/\S+$/.test(url)) throw new CommunityError('The joining link must start with https://.');
  const vals = [title.slice(0, 200), summary.slice(0, 4000), starts, ends, f.mode === 'in_person' ? 'in_person' : 'online', String(f.location || '').slice(0, 300), url.slice(0, 500), cap ? +cap : null, ['public', 'account', 'members'].includes(f.audience) ? f.audience : 'account'];
  if (id) { await q(`UPDATE community_events SET title=$1, summary=$2, starts_at=$3, ends_at=$4, mode=$5, location=$6, join_url=$7, capacity=$8, audience=$9 WHERE id = $10`, [...vals, id]); return id; }
  const { rows: [e] } = await q(`INSERT INTO community_events (title, summary, starts_at, ends_at, mode, location, join_url, capacity, audience, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [...vals, user.id]);
  await audit({ user, action: 'event.create', target: e.id });
  return e.id;
}
async function setEventStatus(user, id, status) {
  if (!['published', 'cancelled', 'draft'].includes(status)) throw new CommunityError('Unknown status.');
  await q('UPDATE community_events SET status = $1 WHERE id = $2', [status, id]);
  await audit({ user, action: `event.${status}`, target: id });
}
async function events({ upcomingOnly = true, includeDrafts = false } = {}) {
  const { rows } = await q(`SELECT e.*, (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS taken FROM community_events e
    WHERE ($1 OR e.status = 'published') AND (NOT $2 OR e.ends_at > now()) ORDER BY e.starts_at`, [includeDrafts, upcomingOnly]);
  return rows;
}

/** Registers the person. Audience, capacity and date are checked inside a transaction that locks the event. */
async function register(user, eventId) {
  return tx(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM community_events WHERE id = $1 FOR UPDATE', [eventId]);
    if (!e || e.status !== 'published') throw new CommunityError('This event is not open for registration.', 404);
    if (new Date(e.starts_at) <= new Date()) throw new CommunityError('This event has already started.');
    if (e.audience === 'members') {
      const { rows: [m] } = await c.query(`SELECT 1 FROM memberships WHERE user_id = $1 AND status = 'active' AND current_date BETWEEN starts_on AND ends_on`, [user.id]);
      if (!m) throw new CommunityError('This event is for members with an active membership.', 403);
    }
    const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1 AND status <> 'cancelled' AND user_id <> $2`, [e.id, user.id]);
    if (e.capacity && n >= e.capacity) throw new CommunityError('This event is full.', 409);
    await c.query(`INSERT INTO event_registrations (event_id, user_id) VALUES ($1,$2) ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'registered', created_at = now()`, [e.id, user.id]);
    await audit({ user, action: 'event.register', target: e.id }, c);
    return e;
  });
}
async function cancelRegistration(user, eventId) {
  const { rowCount } = await q(`UPDATE event_registrations SET status = 'cancelled' WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`, [eventId, user.id]);
  if (!rowCount) throw new CommunityError('Not registered.', 404);
}
async function myEvents(userId) {
  return (await q(`SELECT e.*, r.status AS reg_status FROM event_registrations r JOIN community_events e ON e.id = r.event_id WHERE r.user_id = $1 AND r.status <> 'cancelled' ORDER BY e.starts_at DESC`, [userId])).rows;
}

// ---------- Contributions ----------
const KINDS = { article: 'Article', tool: 'Tool or template', case_study: 'Case study', other: 'Other' };
async function contribute(user, f) {
  const title = String(f.title || '').trim(); const summary = String(f.summary || '').trim();
  if (title.length < 3 || summary.length < 30) throw new CommunityError('Give a title and a summary of at least 30 characters.');
  if (hasNonLatin(title) || hasNonLatin(summary)) throw new CommunityError('Write the proposal in English (Latin letters).');
  const { rows: [r] } = await q('INSERT INTO contributions (user_id, kind, title, summary, show_name) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [user.id, KINDS[f.kind] ? f.kind : 'other', title.slice(0, 200), summary.slice(0, 5000), f.show_name === 'yes']);
  await audit({ user, action: 'contribution.submit', target: r.id });
  return r.id;
}
async function decideContribution(staff, id, accept, note) {
  const why = String(note || '').trim(); if (why.length < 5) throw new CommunityError('Record a note for the person.');
  const { rowCount } = await q(`UPDATE contributions SET status = $1, decision_note = $2, decided_by = $3, decided_at = now() WHERE id = $4 AND status = 'submitted'`, [accept ? 'accepted' : 'declined', why.slice(0, 2000), staff.id, id]);
  if (!rowCount) throw new CommunityError('Only a submitted proposal can be decided.');
  await audit({ user: staff, action: accept ? 'contribution.accept' : 'contribution.decline', target: id });
}

module.exports = { CommunityError, CONSENT_TEXT, TOPICS, KINDS, ensureToken, setConsent, setTopics, unsubscribe, consentHistory, saveIssue, approveIssue, audienceCount, queueIssue, saveEvent, setEventStatus, events, register, cancelRegistration, myEvents, contribute, decideContribution };
