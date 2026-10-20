// Partnership levels (docs/PARTNER-LEVELS.md). Bronze, Silver, Gold describe the size of the commitment and the record with LIV; they
// are not a rating of training quality. Every provider meets the same authorization criteria and the same surveillance rules.
// A level changes only by a review: the assessor records a finding per criterion, the decision-maker (a different person) decides.
// The thresholds below are the proposed starting values (draft criteria LVL-CRIT v0.1, P-15) and live in this one table.
// Issued volume is never a criterion. Paying does not shorten a minimum period: only the evidence route does.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const pos = require('./positions');
const { ApplicationError } = require('./applications');

const ORDER = ['bronze', 'silver', 'gold'];
const LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const PLAN = { bronze: 'Starter', silver: 'Professional', gold: 'Enterprise' };
const VERSION = 'LVL-CRIT v0.1 (draft)';

// Each criterion: key, label, and whether the system can compute it (auto) or the assessor records it (manual).
const CRITERIA = {
  silver: [
    { key: 'min_time', label: 'At least 12 months as Bronze (6 months by the evidence route: documented prior record of 3 years, passed early sample review and an early surveillance)', auto: true },
    { key: 'surveillance', label: 'One completed annual surveillance review with no major finding' },
    { key: 'samples', label: 'Two passed sample reviews of batches against training evidence' },
    { key: 'nonconformities', label: 'No major nonconformity open; every minor one closed by its due date' },
    { key: 'standing', label: 'No suspension in the last 12 months', auto: true },
    { key: 'complaints', label: 'No substantiated complaint unresolved; resolved ones closed within the target' },
    { key: 'records', label: 'Trainer records current for every scope, two-factor sign-in on for all administrators, learner-protection documents current', auto: true },
    { key: 'commitment', label: 'The annual plan of the new level is paid in advance' },
  ],
  gold: [
    { key: 'min_time', label: 'At least 12 months as Silver and 24 months in total', auto: true },
    { key: 'surveillance', label: 'Two consecutive clean surveillance reviews' },
    { key: 'samples', label: 'Four passed sample reviews in total' },
    { key: 'nonconformities', label: 'No major nonconformity open or in the last 24 months; every minor one closed by its due date' },
    { key: 'standing', label: 'No suspension in the last 24 months', auto: true },
    { key: 'complaints', label: 'No substantiated complaint unresolved; resolved ones closed within the target' },
    { key: 'records', label: 'Trainer records current for every scope, two-factor sign-in on for all administrators, learner-protection documents current', auto: true },
    { key: 'commitment', label: 'The annual plan of the new level is paid in advance' },
    { key: 'quality_officer', label: 'A named quality officer' },
    { key: 'data_return', label: 'An annual data return (batches, completions, complaints)' },
    { key: 'footprint', label: 'Evidence of the wider footprint (several sites or countries, or very high volume)' },
  ],
};
const monthsBetween = (from, to = new Date()) => (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) - (to.getDate() < from.getDate() ? 1 : 0);

/** What the system can establish by itself, to sit beside the assessor's findings. */
async function autoEvidence(platformId, target) {
  const { rows: [p] } = await q('SELECT level, level_since, created_at FROM platforms WHERE id = $1', [platformId]);
  const { rows: [act] } = await q('SELECT min(created_at) AS at FROM partner_activations WHERE platform_id = $1', [platformId]);
  const since = new Date(p.level_since || p.created_at); const joined = new Date(act?.at || p.created_at);
  const atLevel = monthsBetween(since); const total = monthsBetween(joined);
  const lookback = target === 'gold' ? 24 : 12;
  const { rows: [susp] } = await q(`SELECT count(*)::int AS n FROM audit_logs WHERE platform_id = $1 AND action = 'platform.status.suspended' AND created_at > now() - ($2::int * interval '1 month')`, [platformId, lookback]);
  const { rows: noTrainer } = await q(`SELECT s.title FROM partner_scopes s WHERE s.platform_id = $1 AND s.status = 'active' AND NOT EXISTS (SELECT 1 FROM partner_scope_trainers t WHERE t.scope_id = s.id)`, [platformId]);
  const { rows: no2fa } = await q(`SELECT email FROM users WHERE platform_id = $1 AND role = 'platform_admin' AND NOT totp_enabled`, [platformId]);
  const minOk = target === 'gold' ? atLevel >= 12 && total >= 24 : atLevel >= 12;
  return {
    min_time: { met: minOk, note: `${atLevel} month(s) at ${LABEL[p.level] || 'the current level'}, ${total} in the programme.${target === 'silver' && !minOk && atLevel >= 6 ? ' The evidence route may apply.' : ''}` },
    standing: { met: susp.n === 0, note: susp.n ? `${susp.n} suspension(s) in the last ${lookback} months.` : `No suspension in the last ${lookback} months.` },
    records: { met: !noTrainer.length && !no2fa.length, note: noTrainer.length ? `No trainer record for: ${noTrainer.map((s) => s.title).join(', ')}. ` : no2fa.length ? `Two-factor not on for: ${no2fa.map((u) => u.email).join(', ')}. ` : 'Trainer records and two-factor sign-in are in place. Learner-protection documents are for the assessor to confirm.' },
  };
}
/** The deterministic recommendation from the criteria answers: promote only when every criterion is met. */
function recommend(target, answers) {
  const unmet = CRITERIA[target].filter((c) => !answers[c.key]?.met).map((c) => c.key);
  return { recommendation: unmet.length ? 'not_yet' : 'promote', unmet };
}

async function nextLevel(level) { return ORDER[ORDER.indexOf(level) + 1] || null; }
async function event(c, id, note) { await c.query('UPDATE partner_level_reviews SET updated_at = now() WHERE id = $1', [id]); }

/** The provider or LIV opens a review toward the next level. One open review per provider. */
async function open(platformId, user, requestedBy) {
  const { rows: [p] } = await q(`SELECT level, accreditation_status FROM platforms WHERE id = $1`, [platformId]);
  if (!p || p.accreditation_status !== 'active' || !p.level) throw new ApplicationError('Only an active provider has a level to review.', 409);
  const to = ORDER[ORDER.indexOf(p.level) + 1];
  if (!to) throw new ApplicationError('The provider is already at the highest level.', 409);
  try {
    return await tx(async (c) => {
      const { rows: [r] } = await c.query(`INSERT INTO partner_level_reviews (platform_id, from_level, to_level, requested_by, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [platformId, p.level, to, requestedBy, user?.id || null]);
      await audit({ user, platformId, action: 'level.review.open', target: r.id, metadata: { from: p.level, to } }, c);
      return r;
    });
  } catch (e) { if (e.code === '23505') throw new ApplicationError('A level review is already open for this provider.', 409); throw e; }
}
async function openDemotion(platformId, user) {
  await pos.require(user, 'assess');
  const { rows: [p] } = await q(`SELECT level FROM platforms WHERE id = $1 AND accreditation_status = 'active'`, [platformId]);
  if (!p?.level || p.level === 'bronze') throw new ApplicationError('There is no lower level to move this provider to.', 409);
  try {
    return await tx(async (c) => {
      const { rows: [r] } = await c.query(`INSERT INTO partner_level_reviews (platform_id, from_level, to_level, requested_by, created_by) VALUES ($1,$2,$3,'liv',$4) RETURNING *`, [platformId, p.level, ORDER[ORDER.indexOf(p.level) - 1], user.id]);
      await audit({ user, platformId, action: 'level.review.open', target: r.id, metadata: { from: p.level, to: r.to_level } }, c);
      return r;
    });
  } catch (e) { if (e.code === '23505') throw new ApplicationError('A level review is already open for this provider.', 409); throw e; }
}

/**
 * The assessor records the answers. For a promotion: a finding per criterion with a note. For a demotion: a recommendation to demote with the
 * reasons (for example, two failed surveillance reviews, or a commitment not renewed after the correction period).
 */
async function assess(id, user, { answers = {}, note = '', demote = false }) {
  await pos.require(user, 'assess');
  return tx(async (c) => {
    const { rows: [r] } = await c.query('SELECT * FROM partner_level_reviews WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw new ApplicationError('Review not found.', 404);
    if (r.status !== 'open') throw new ApplicationError(`The review is ${r.status.replace(/_/g, ' ')}, not waiting for the assessment.`, 409);
    const down = ORDER.indexOf(r.to_level) < ORDER.indexOf(r.from_level);
    let rec; let criteria = null;
    if (down) {
      if (!String(note).trim()) throw new ApplicationError('Write the reasons for the lower level.');
      rec = demote ? 'demote' : 'not_yet';
    } else {
      criteria = {};
      for (const k of CRITERIA[r.to_level]) {
        const a = answers[k.key] || {}; const text = String(a.note || '').trim();
        if (!text) throw new ApplicationError(`${k.label.slice(0, 60)}...: write a finding.`);
        criteria[k.key] = { met: !!a.met, note: text.slice(0, 1000) };
      }
      rec = recommend(r.to_level, criteria).recommendation;
    }
    await c.query(`UPDATE partner_level_reviews SET criteria = $2, recommendation = $3, reviewer_id = $4, reviewer_label = $5, review_note = $6, status = 'awaiting_decision', updated_at = now() WHERE id = $1`,
      [id, criteria ? JSON.stringify(criteria) : null, rec, user.id, user.email, String(note).trim().slice(0, 4000)]);
    await audit({ user, platformId: r.platform_id, action: 'level.review.assess', target: id, metadata: { recommendation: rec } }, c);
    return { id, recommendation: rec };
  });
}
/** The decision-maker decides. Not the assessor. A promotion needs a recommendation to promote; the level changes only here. */
async function decide(id, user, { outcome, reason }) {
  await pos.require(user, 'decide');
  if (!['promoted', 'not_yet', 'demoted'].includes(outcome)) throw new ApplicationError('Choose a decision.');
  const why = String(reason || '').trim();
  if (!why) throw new ApplicationError('The reasons are required.');
  return tx(async (c) => {
    const { rows: [r] } = await c.query('SELECT * FROM partner_level_reviews WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw new ApplicationError('Review not found.', 404);
    if (r.status !== 'awaiting_decision') throw new ApplicationError(`The review is ${r.status.replace(/_/g, ' ')}, not waiting for a decision.`, 409);
    if (r.reviewer_id === user.id) throw new ApplicationError('You assessed this review, so another decision-maker must decide it.', 403);
    const down = ORDER.indexOf(r.to_level) < ORDER.indexOf(r.from_level);
    if (outcome === 'promoted' && (down || r.recommendation !== 'promote')) throw new ApplicationError('A promotion needs an assessment that recommends it.', 409);
    if (outcome === 'demoted' && (!down || r.recommendation !== 'demote')) throw new ApplicationError('A lower level needs an assessment that recommends it.', 409);
    await c.query(`UPDATE partner_level_reviews SET status = 'decided', outcome = $2, decided_by = $3, decided_by_label = $4, decision_reason = $5, decided_at = now(), updated_at = now() WHERE id = $1`, [id, outcome, user.id, user.email, why]);
    if (outcome !== 'not_yet') await c.query('UPDATE platforms SET level = $2, level_since = CURRENT_DATE WHERE id = $1', [r.platform_id, r.to_level]);
    await audit({ user, platformId: r.platform_id, action: `level.${outcome}`, target: id, metadata: { from: r.from_level, to: r.to_level } }, c);
    return { id, outcome, platformId: r.platform_id, from: r.from_level, to: r.to_level };
  }).then(async (r) => {
    await require('./email').queueToPlatform(r.platformId, 'status_update', { title: 'Your partnership level', message: r.outcome === 'not_yet' ? 'LIV reviewed your level and the answer for now is: not yet.' : `Your partnership level is now ${LABEL[r.to]}.`, reason: why, url: '/portal/level', label: 'View your level' }, `level:${id}`).catch(() => {});
    return r;
  });
}
async function withdraw(id, platformId) {
  const { rowCount } = await q(`UPDATE partner_level_reviews SET status = 'withdrawn', updated_at = now() WHERE id = $1 AND platform_id = $2 AND status IN ('open','awaiting_decision')`, [id, platformId]);
  if (!rowCount) throw new ApplicationError('Level review not found.', 404);
}

async function get(id) {
  const { rows: [r] } = await q('SELECT r.*, p.company_name, p.level, p.level_since FROM partner_level_reviews r JOIN platforms p ON p.id = r.platform_id WHERE r.id = $1', [id]);
  if (!r) throw new ApplicationError('Review not found.', 404);
  const down = ORDER.indexOf(r.to_level) < ORDER.indexOf(r.from_level);
  return { ...r, down, criteriaDef: down ? [] : CRITERIA[r.to_level], auto: down ? {} : await autoEvidence(r.platform_id, r.to_level) };
}
async function list() { return (await q(`SELECT r.id, r.from_level, r.to_level, r.status, r.outcome, r.requested_by, r.updated_at, p.company_name FROM partner_level_reviews r JOIN platforms p ON p.id = r.platform_id ORDER BY (r.status IN ('open','awaiting_decision')) DESC, r.updated_at DESC LIMIT 200`)).rows; }
async function forProvider(platformId) {
  const { rows: [p] } = await q('SELECT level, level_since, public_number, accreditation_status FROM platforms WHERE id = $1', [platformId]);
  const { rows: reviews } = await q('SELECT id, from_level, to_level, status, outcome, decision_reason, requested_by, updated_at FROM partner_level_reviews WHERE platform_id = $1 ORDER BY created_at DESC', [platformId]);
  return { ...p, reviews };
}
module.exports = { ORDER, LABEL, PLAN, VERSION, CRITERIA, monthsBetween, autoEvidence, recommend, nextLevel, open, openDemotion, assess, decide, withdraw, get, list, forProvider };
