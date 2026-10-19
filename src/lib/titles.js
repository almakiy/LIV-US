// Title (course) requests (F2). Provider side: draft, submit, resubmit, withdraw. LIV side: the reviewer returns or recommends;
// the Authorization Decision-Maker, a different person, authorizes or refuses. An authorized title becomes an authorized scope row,
// which is what issuance (Batch B) checks. Fees for title requests are pending the owner's approval (P-6) and are not charged here.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const pos = require('./positions');
const F = require('./title-form');
const { ApplicationError } = require('./applications');

const EDITABLE = ['draft', 'needs_changes', 'needs_wider_review'];
const RETURNS = { changes: 'needs_changes', wider_review: 'needs_wider_review', scope_expansion: 'needs_scope_expansion' };
const OUTCOME_TEXT = { needs_changes: 'needs changes', needs_wider_review: 'needs a wider review', needs_scope_expansion: 'needs a scope expansion', authorized: 'authorized', refused: 'refused' };

/** A provider may ask for titles once it is active, or its application has been accepted. */
async function eligible(platformId) {
  const { rows: [r] } = await q(`SELECT (p.accreditation_status = 'active' OR EXISTS (SELECT 1 FROM partner_applications a WHERE a.platform_id = p.id AND a.state IN ('accepted_pending_activation','activated'))) AS ok
    FROM platforms p WHERE p.id = $1`, [platformId]);
  return !!r?.ok;
}

async function event(c, id, to, actor, note, visible = true) {
  await c.query('INSERT INTO partner_title_events (request_id, to_status, visible, actor_label, note) VALUES ($1,$2,$3,$4,$5)', [id, to, visible, actor?.email || 'system', String(note || '').slice(0, 4000)]);
  await c.query('UPDATE partner_title_requests SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
}
async function lockOwn(c, id, platformId) {
  const { rows: [t] } = await c.query('SELECT * FROM partner_title_requests WHERE id = $1 AND platform_id = $2 FOR UPDATE', [id, platformId]);
  if (!t) throw new ApplicationError('Title request not found.', 404);
  return t;
}
async function lockAny(c, id) {
  const { rows: [t] } = await c.query('SELECT * FROM partner_title_requests WHERE id = $1 FOR UPDATE', [id]);
  if (!t) throw new ApplicationError('Title request not found.', 404);
  return t;
}

async function create(platformId, user, title) {
  if (!(await eligible(platformId))) throw new ApplicationError('Title requests open once your application is accepted.', 409);
  const t = String(title || '').trim().slice(0, 200);
  if (!t) throw new ApplicationError('Enter the title.');
  const errs = F.validate({ title: t });
  if (errs.length) throw new ApplicationError(errs[0].message);
  try {
    return await tx(async (c) => {
      const { rows: [r] } = await c.query(`INSERT INTO partner_title_requests (platform_id, title, form, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [platformId, t, JSON.stringify({ title: t }), user?.id || null]);
      await event(c, r.id, 'draft', user, 'Started');
      await audit({ user, platformId, action: 'title.create', target: r.id, metadata: { title: t } }, c);
      return r;
    });
  } catch (e) { if (e.code === '23505') throw new ApplicationError('A request for this title already exists.', 409); throw e; }
}

async function saveDraft(id, platformId, user, form) {
  return tx(async (c) => {
    const t = await lockOwn(c, id, platformId);
    if (!EDITABLE.includes(t.status)) throw new ApplicationError(`The request cannot be edited while it is ${t.status.replace(/_/g, ' ')}.`, 409);
    const next = { ...t.form, ...form, title: t.title }; // the title is the identity of the request; a different title is a new request
    await c.query('UPDATE partner_title_requests SET form = $2, updated_at = now() WHERE id = $1', [id, JSON.stringify(next)]);
    return next;
  });
}

async function submit(id, platformId, user) {
  return tx(async (c) => {
    const t = await lockOwn(c, id, platformId);
    if (!EDITABLE.includes(t.status)) throw new ApplicationError(`The request cannot be submitted while it is ${t.status.replace(/_/g, ' ')}.`, 409);
    const errs = F.validate(F.clean(t.form), { submit: true });
    if (errs.length) throw new ApplicationError(errs[0].message);
    const revision = t.revision + 1;
    await c.query('INSERT INTO partner_title_revisions (request_id, revision, form, submitted_by) VALUES ($1,$2,$3,$4)', [id, revision, JSON.stringify(t.form), user?.id || null]);
    await c.query('UPDATE partner_title_requests SET revision = $2, reviewer_id = NULL, reviewer_label = NULL, recommendation = NULL, review_note = NULL WHERE id = $1', [id, revision]);
    await event(c, id, 'submitted', user, `Revision ${revision} submitted`);
    await audit({ user, platformId, action: 'title.submit', target: id, metadata: { revision } }, c);
    return { id, revision };
  });
}

async function withdraw(id, platformId, user) {
  return tx(async (c) => {
    const t = await lockOwn(c, id, platformId);
    if (['authorized', 'refused', 'withdrawn'].includes(t.status)) throw new ApplicationError(`The request is already ${t.status}.`, 409);
    await event(c, id, 'withdrawn', user, 'Withdrawn by the provider');
  });
}

/**
 * The reviewer (assessor position) recommends. Returning outcomes (changes, wider review, scope expansion) go straight back to the provider
 * with the note as the message. Authorize or refuse moves the request to the decision-maker; the note stays internal until decided.
 */
async function review(id, user, { recommendation, note }) {
  await pos.require(user, 'assess');
  const why = String(note || '').trim();
  if (!why) throw new ApplicationError('Write the finding. It is shown to the provider when the request is returned.');
  return tx(async (c) => {
    const t = await lockAny(c, id);
    if (t.status !== 'submitted') throw new ApplicationError(`The request is ${t.status.replace(/_/g, ' ')}, not waiting for review.`, 409);
    if (RETURNS[recommendation]) {
      await c.query('UPDATE partner_title_requests SET reviewer_id = $2, reviewer_label = $3, recommendation = $4, review_note = $5 WHERE id = $1', [id, user.id, user.email, recommendation, why]);
      await event(c, id, RETURNS[recommendation], user, why);
    } else if (['authorize', 'refuse'].includes(recommendation)) {
      await c.query('UPDATE partner_title_requests SET reviewer_id = $2, reviewer_label = $3, recommendation = $4, review_note = $5 WHERE id = $1', [id, user.id, user.email, recommendation, why]);
      await event(c, id, 'awaiting_decision', user, `Recommendation: ${recommendation}. ${why}`, false);
    } else throw new ApplicationError('Choose an outcome.');
    await audit({ user, platformId: t.platform_id, action: 'title.review', target: id, metadata: { recommendation } }, c);
    return { id, status: RETURNS[recommendation] || 'awaiting_decision', platformId: t.platform_id, title: t.title, note: why };
  }).then(async (r) => { if (r.status !== 'awaiting_decision') await notify(r.platformId, r.title, r.status, r.note, id); return r; });
}

/** The decision-maker authorizes or refuses. Not the reviewer; authorizing needs a recommendation to authorize. Authorizing grants an authorized scope. */
async function decide(id, user, { outcome, reason }) {
  await pos.require(user, 'decide');
  if (!['authorized', 'refused'].includes(outcome)) throw new ApplicationError('Choose a decision.');
  const why = String(reason || '').trim();
  if (!why) throw new ApplicationError('The reasons for the decision are required.');
  return tx(async (c) => {
    const t = await lockAny(c, id);
    if (t.status !== 'awaiting_decision') throw new ApplicationError(`The request is ${t.status.replace(/_/g, ' ')}, not waiting for a decision.`, 409);
    if (t.reviewer_id === user.id) throw new ApplicationError('You reviewed this request, so another decision-maker must decide it.', 403);
    if (outcome === 'authorized' && t.recommendation !== 'authorize') throw new ApplicationError(`The reviewer recommended "${t.recommendation}", so the title cannot be authorized. Refuse it, or ask the reviewer to look again.`, 409);
    let scopeId = null;
    if (outcome === 'authorized') {
      const { rows: [sc] } = await c.query(`INSERT INTO partner_scopes (platform_id, title, decision_note, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
        [t.platform_id, t.title, `Title request ${t.id} authorized`, user.id]);
      scopeId = sc.id;
    }
    await c.query('UPDATE partner_title_requests SET decided_by = $2, decided_by_label = $3, decision_reason = $4, decided_at = now(), scope_id = $5 WHERE id = $1', [id, user.id, user.email, why, scopeId]);
    await event(c, id, outcome, user, why);
    await audit({ user, platformId: t.platform_id, action: `title.${outcome}`, target: id, metadata: { scope: scopeId } }, c);
    return { id, status: outcome, platformId: t.platform_id, title: t.title, note: why, scopeId };
  }).then(async (r) => { await notify(r.platformId, r.title, r.status, r.note, id); return r; });
}

async function notify(platformId, title, status, note, id) {
  await require('./email').queueToPlatform(platformId, 'title_outcome', { title, outcome: OUTCOME_TEXT[status] || status, reason: note }, `title:${id}:${status}:${Date.now()}`).catch(() => {});
}

async function listOwn(platformId) {
  return (await q('SELECT id, title, status, revision, updated_at FROM partner_title_requests WHERE platform_id = $1 ORDER BY updated_at DESC', [platformId])).rows;
}
/** Provider view: the request, and the history without the reviewer's internal notes. */
async function getOwn(id, platformId) {
  const { rows: [t] } = await q('SELECT * FROM partner_title_requests WHERE id = $1 AND platform_id = $2', [id, platformId]);
  if (!t) throw new ApplicationError('Title request not found.', 404);
  const { rows: events } = await q('SELECT to_status, actor_label, note, created_at FROM partner_title_events WHERE request_id = $1 AND visible ORDER BY created_at, id', [id]);
  const trainers = (await q(`SELECT DISTINCT tr.trainer_name FROM partner_scope_trainers tr JOIN partner_scopes s ON s.id = tr.scope_id WHERE s.platform_id = $1 ORDER BY 1`, [platformId])).rows.map((r) => r.trainer_name);
  return { ...t, events, trainers };
}
async function listAll() {
  return (await q(`SELECT t.id, t.title, t.status, t.revision, t.updated_at, p.company_name FROM partner_title_requests t JOIN platforms p ON p.id = t.platform_id
    WHERE t.status <> 'draft' ORDER BY (t.status IN ('submitted','awaiting_decision')) DESC, t.updated_at DESC`)).rows;
}
async function getForStaff(id) {
  const { rows: [t] } = await q('SELECT t.*, p.company_name FROM partner_title_requests t JOIN platforms p ON p.id = t.platform_id WHERE t.id = $1', [id]);
  if (!t) throw new ApplicationError('Title request not found.', 404);
  const { rows: events } = await q('SELECT to_status, visible, actor_label, note, created_at FROM partner_title_events WHERE request_id = $1 ORDER BY created_at, id', [id]);
  const { rows: revisions } = await q('SELECT revision, form, submitted_at FROM partner_title_revisions WHERE request_id = $1 ORDER BY revision', [id]);
  const trainers = (await q(`SELECT DISTINCT tr.trainer_name FROM partner_scope_trainers tr JOIN partner_scopes s ON s.id = tr.scope_id WHERE s.platform_id = $1`, [t.platform_id])).rows.map((r) => r.trainer_name);
  return { ...t, events, revisions, trainers };
}

module.exports = { EDITABLE, eligible, create, saveDraft, submit, withdraw, review, decide, listOwn, getOwn, listAll, getForStaff };
