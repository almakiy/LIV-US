// Policy exceptions (owner decision, October 2026). Staff prepare a case; only the main account approves, for one rule, one case and a
// bounded time or number of uses. An exception never proves a criterion that was not met, never changes real time, evidence or the
// original score, never moves to another case and never renews itself. Normal procedures and published alternatives are not exceptions.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError } = require('./applications');

// What an exception may be about (a narrow list; the owner can widen it). Anything else is refused at preparation.
const CASE_TYPES = {
  payment_deferral: 'Deferral of a payment inside the permitted commercial limits (the debt stays recorded as it is)',
  late_administrative_submission: 'A late administrative submission backed by real evidence',
  other_procedural: 'Another procedural step, described precisely',
};
// These are outside the authority of any exception: refused at once with the reason.
const FORBIDDEN = {
  fabricated_completion: 'Inventing a completion, an identity, a licence or a recognition',
  disabled_credential_type: 'Granting a credential type that is not enabled',
  quality_requirement: 'Dropping a quality requirement that a valid credential depends on',
  legal_breach: 'Breaking an applicable law or another party\'s rights',
  false_payment_status: 'Showing a settlement that did not happen',
  hidden_conflict: 'Hiding a material conflict or erasing the record of a decision',
};
const TEXT = [['rule_ref', 'The rule and its version', 200], ['subject_ref', 'The case it applies to (an application, batch, invoice or other id)', 200], ['reason', 'Why the rule cannot be followed here', 2000],
  ['why_not_standard', 'Why a normal procedure or published alternative is not enough', 2000], ['evidence', 'Evidence', 2000], ['impact', 'Effect on the learner, on integrity and on resources', 2000],
  ['limits', 'Exactly what the exception allows', 1500], ['executor', 'Who carries it out', 200], ['closing_conditions', 'What closes it', 1000]];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The main account is the one super admin account that holds no staff position and is not vacant. */
async function isMainAccount(user) {
  if (!user?.id) return false;
  const { rows: [u] } = await q(`SELECT 1 FROM users WHERE id = $1 AND role = 'super_admin' AND staff_position IS NULL AND NOT vacant`, [user.id]);
  return !!u;
}
async function requireStaff(user) {
  const { rows: [u] } = await q(`SELECT 1 FROM users WHERE id = $1 AND role = 'super_admin' AND NOT vacant`, [user?.id || null]);
  if (!u) throw new ApplicationError('Only LIV staff can prepare an exception.', 403);
}
async function event(c, id, to, actor, note) {
  await c.query('INSERT INTO policy_exception_events (exception_id, to_status, actor_label, note) VALUES ($1,$2,$3,$4)', [id, to, actor?.email || 'system', String(note || '').slice(0, 2000)]);
  await c.query('UPDATE policy_exceptions SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
}

async function prepare(user, body) {
  await requireStaff(user);
  const type = String(body.case_type || '');
  if (FORBIDDEN[type]) throw new ApplicationError(`This cannot be an exception: ${FORBIDDEN[type]}.`, 422);
  if (!CASE_TYPES[type]) throw new ApplicationError('Choose what the exception is about.');
  const v = {};
  for (const [k, label, max] of TEXT) { v[k] = String(body[k] ?? '').trim().slice(0, max); if (!v[k]) throw new ApplicationError(`${label}: this is required.`); }
  const from = String(body.valid_from || ''), until = String(body.valid_until || '');
  const uses = Math.max(1, Math.min(20, parseInt(body.max_uses, 10) || 1));
  if (!DATE_RE.test(from) || !DATE_RE.test(until) || until < from) throw new ApplicationError('Give the dates the exception may be used, from and until.');
  const { rows: [p] } = await q('SELECT id FROM platforms WHERE id = $1', [/^[0-9a-f-]{36}$/i.test(body.platform_id || '') ? body.platform_id : null]);
  return tx(async (c) => {
    const { rows: [e] } = await c.query(`INSERT INTO policy_exceptions (case_type, platform_id, rule_ref, subject_ref, reason, why_not_standard, evidence, impact, limits, executor, closing_conditions, specialist_opinion, valid_from, valid_until, max_uses, prepared_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [type, p?.id || null, v.rule_ref, v.subject_ref, v.reason, v.why_not_standard, v.evidence, v.impact, v.limits, v.executor, v.closing_conditions, String(body.specialist_opinion || '').trim().slice(0, 2000) || null, from, until, uses, user.id]);
    await event(c, e.id, 'prepared', user, 'Prepared for the main account');
    await audit({ user, platformId: e.platform_id, action: 'exception.prepare', target: e.id, metadata: { type, rule: v.rule_ref } }, c);
    return e;
  });
}
/** Approve or refuse. Main account only. */
async function decide(id, user, { outcome, reason }) {
  if (!(await isMainAccount(user))) throw new ApplicationError('Only the main account approves an exception.', 403);
  if (!['approved', 'refused'].includes(outcome)) throw new ApplicationError('Choose a decision.');
  const why = String(reason || '').trim();
  if (!why) throw new ApplicationError('The reasons are required.');
  return tx(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM policy_exceptions WHERE id = $1 FOR UPDATE', [id]);
    if (!e) throw new ApplicationError('Exception not found.', 404);
    if (e.status !== 'prepared') throw new ApplicationError(`The exception is ${e.status}, not waiting for a decision.`, 409);
    await c.query('UPDATE policy_exceptions SET decided_by = $2, decided_at = now(), decision_reason = $3 WHERE id = $1', [id, user.id, why]);
    await event(c, id, outcome, user, why);
    await audit({ user, platformId: e.platform_id, action: `exception.${outcome}`, target: id }, c);
    return { id, status: outcome };
  });
}
/**
 * Called by the step that would use the exception. It must match the rule and the case, be inside its dates and have a use left.
 * Returns the exception id; throws otherwise. Nothing calls it automatically: each rule that accepts exceptions calls it explicitly.
 */
async function consume(id, { ruleRef, subjectRef }, user) {
  return tx(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM policy_exceptions WHERE id = $1 FOR UPDATE', [id]);
    if (!e) throw new ApplicationError('Exception not found.', 404);
    if (e.status !== 'approved') throw new ApplicationError(`The exception is ${e.status}, not approved for use.`, 409);
    if (e.rule_ref !== ruleRef || e.subject_ref !== subjectRef) throw new ApplicationError('The exception applies to a different rule or case.', 409);
    const today = new Date().toISOString().slice(0, 10);
    if (today < String(e.valid_from).slice(0, 10) || today > String(e.valid_until).slice(0, 10)) throw new ApplicationError('The exception is outside its dates.', 409);
    if (e.uses >= e.max_uses) throw new ApplicationError('The exception has no uses left.', 409);
    await c.query('UPDATE policy_exceptions SET uses = uses + 1 WHERE id = $1', [id]);
    await event(c, id, e.uses + 1 >= e.max_uses ? 'used' : 'approved', user, `Used for ${subjectRef}`);
    await audit({ user, platformId: e.platform_id, action: 'exception.use', target: id, metadata: { subject: subjectRef } }, c);
    return e.id;
  });
}
async function close(id, user, note) {
  await requireStaff(user);
  if (!String(note || '').trim()) throw new ApplicationError('Record how it was closed.');
  return tx(async (c) => {
    const { rows: [e] } = await c.query('SELECT * FROM policy_exceptions WHERE id = $1 FOR UPDATE', [id]);
    if (!e) throw new ApplicationError('Exception not found.', 404);
    if (!['approved', 'used', 'expired'].includes(e.status)) throw new ApplicationError(`An exception that is ${e.status} cannot be closed.`, 409);
    await c.query('UPDATE policy_exceptions SET closed_at = now() WHERE id = $1', [id]);
    await event(c, id, 'closed', user, note);
    return { id };
  });
}
/** Approved exceptions past their end date become expired. Never renewed. */
async function expire() {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT id FROM policy_exceptions WHERE status = 'approved' AND valid_until < CURRENT_DATE FOR UPDATE`);
    for (const r of rows) await event(c, r.id, 'expired', null, 'Past its end date');
    return rows.length;
  });
}
async function list() { return (await q(`SELECT e.*, p.company_name FROM policy_exceptions e LEFT JOIN platforms p ON p.id = e.platform_id ORDER BY (e.status = 'prepared') DESC, e.created_at DESC LIMIT 200`)).rows; }
async function recurrence() { return (await q(`SELECT case_type, rule_ref, count(*)::int AS n FROM policy_exceptions GROUP BY case_type, rule_ref HAVING count(*) > 1 ORDER BY n DESC`)).rows; }
async function get(id) {
  const { rows: [e] } = await q('SELECT e.*, p.company_name FROM policy_exceptions e LEFT JOIN platforms p ON p.id = e.platform_id WHERE e.id = $1', [id]);
  if (!e) throw new ApplicationError('Exception not found.', 404);
  const { rows: events } = await q('SELECT to_status, actor_label, note, created_at FROM policy_exception_events WHERE exception_id = $1 ORDER BY created_at, id', [id]);
  return { ...e, events };
}

module.exports = { CASE_TYPES, FORBIDDEN, isMainAccount, prepare, decide, consume, close, expire, list, recurrence, get };
