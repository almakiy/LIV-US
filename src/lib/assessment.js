// Assessment, recommendation and decision for partner applications (docs/PARTNER-AUTHORIZATION.md §3-§5; Batch E).
// Rules are fixed and deterministic (no weights, no thresholds). Nothing here is edited in place: a re-assessment is a
// new assessment, a recalculation is a new recommendation, and the database locks every row once written.
// The assessor and the decision-maker are separate individual accounts; this is checked here, not only in the screens.
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError, event } = require('./applications');

const CRITERIA = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];
const RESULTS = ['met', 'minor', 'major', 'needs_information'];
const DECISIONS = ['accepted', 'accepted_with_conditions', 'declined'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: findings [{criterion, result}] -> { outcome, counts }. A failed criterion is never averaged away. */
function recommend(findings) {
  const by = Object.fromEntries(findings.map((f) => [f.criterion, f.result]));
  const counts = { met: 0, minor: 0, major: 0, needs_information: 0, missing: 0 };
  for (const c of CRITERIA) counts[by[c] || 'missing']++;
  let outcome = 'accept';
  if (counts.needs_information || counts.missing) outcome = 'incomplete';
  else if (counts.major) outcome = 'not_ready';
  else if (counts.minor) outcome = 'accept_with_conditions';
  return { outcome, counts, major: CRITERIA.filter((c) => by[c] === 'major'), minor: CRITERIA.filter((c) => by[c] === 'minor') };
}

/** Pure: a fingerprint of everything a recommendation is computed from. */
function inputHash({ criteria, version, findings, evidence }) {
  const norm = {
    criteria,
    version,
    findings: [...findings].sort((a, b) => a.criterion.localeCompare(b.criterion)).map((f) => [f.criterion, f.result, f.reason, f.evidence_id || null]),
    evidence: [...evidence].sort((a, b) => a.id.localeCompare(b.id)).map((e) => [e.id, e.sha256]),
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function needStaff(user) { if (!user || user.role !== 'super_admin') throw new ApplicationError('Only LIV staff can make this change.', 403); }

async function lockApp(c, appId) {
  const { rows: [app] } = await c.query('SELECT * FROM partner_applications WHERE id = $1 FOR UPDATE', [appId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  return app;
}

async function currentHash(c, app, assessment) {
  const { rows: [set] } = await c.query('SELECT criteria FROM partner_criteria_sets WHERE version = $1', [assessment.criteria_version]);
  const { rows: findings } = await c.query('SELECT criterion, result, reason, evidence_id FROM partner_assessment_findings WHERE assessment_id = $1', [assessment.id]);
  const { rows: evidence } = await c.query('SELECT id, sha256 FROM partner_application_evidence WHERE application_id = $1 AND version IS NOT NULL AND version <= $2', [app.id, assessment.version]);
  return { hash: inputHash({ criteria: set.criteria, version: assessment.version, findings, evidence }), findings };
}

async function latest(c, app) {
  const { rows: [a] } = await c.query('SELECT * FROM partner_assessments WHERE application_id = $1 ORDER BY created_at DESC, id LIMIT 1', [app.id]);
  if (!a) return null;
  const { rows: [rec] } = await c.query('SELECT * FROM partner_recommendations WHERE assessment_id = $1 ORDER BY created_at DESC, id LIMIT 1', [a.id]);
  const { hash } = await currentHash(c, app, a);
  return { assessment: a, recommendation: rec, current: !!rec && rec.input_hash === hash && a.version === app.current_version };
}

async function addRecommendation(c, app, assessment, user) {
  const { hash, findings } = await currentHash(c, app, assessment);
  const r = recommend(findings);
  const { rows: [rec] } = await c.query(`INSERT INTO partner_recommendations (assessment_id, outcome, rationale, input_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [assessment.id, r.outcome, JSON.stringify({ counts: r.counts, major: r.major, minor: r.minor, criteria_version: assessment.criteria_version }), hash, user?.id || null]);
  return rec;
}

/** An assessor records one finding per criterion C1 to C9 against the submitted version. Only while in technical review. */
async function recordAssessment(appId, user, { summary, findings }) {
  needStaff(user);
  if (!findings || typeof findings !== 'object') throw new ApplicationError('Findings are required.');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    if (app.state !== 'technical_review') throw new ApplicationError(`An assessment can be recorded only during technical review (the application is ${app.state}).`, 409);
    const { rows: evidence } = await c.query('SELECT id FROM partner_application_evidence WHERE application_id = $1 AND version IS NOT NULL AND version <= $2', [app.id, app.current_version]);
    const known = new Set(evidence.map((e) => e.id));
    const rows = CRITERIA.map((code) => {
      const f = findings[code] || {};
      const reason = String(f.reason || '').trim();
      const evidenceId = f.evidence_id ? String(f.evidence_id) : null;
      if (!RESULTS.includes(f.result)) throw new ApplicationError(`${code}: choose a result.`);
      if (!reason) throw new ApplicationError(`${code}: a reason is required for every finding.`);
      if (evidenceId && !known.has(evidenceId)) throw new ApplicationError(`${code}: the evidence is not part of this application's submitted versions.`);
      if (f.result === 'met' && !evidenceId) throw new ApplicationError(`${code}: a criterion can be recorded as met only against reviewed evidence.`);
      return [code, f.result, reason.slice(0, 4000), evidenceId];
    });
    const { rows: [a] } = await c.query(`INSERT INTO partner_assessments (application_id, version, criteria_version, assessor_user_id, assessor_label, summary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [app.id, app.current_version, app.criteria_version, user.id, user.email, String(summary || '').trim().slice(0, 4000)]);
    for (const r of rows) await c.query('INSERT INTO partner_assessment_findings (assessment_id, criterion, result, reason, evidence_id) VALUES ($1,$2,$3,$4,$5)', [a.id, ...r]);
    const rec = await addRecommendation(c, app, a, user);
    await audit({ user, platformId: app.platform_id, action: 'application.assessment', target: app.id, metadata: { assessment: a.id, version: a.version, recommendation: rec.outcome } }, c);
    return { assessment: a, recommendation: rec };
  });
}

/** Recomputes the recommendation for the latest assessment. Adds a new row; the earlier one stays. Never touches a decision. */
async function recalculate(appId, user) {
  needStaff(user);
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    const cur = await latest(c, app);
    if (!cur) throw new ApplicationError('There is no assessment to recalculate.', 409);
    const rec = await addRecommendation(c, app, cur.assessment, user);
    await audit({ user, platformId: app.platform_id, action: 'application.recommendation', target: app.id, metadata: { assessment: cur.assessment.id, recommendation: rec.outcome } }, c);
    return rec;
  });
}

/** Whether the application may move to awaiting_decision: a complete assessment of the current version with an up-to-date recommendation. */
async function readyForDecision(c, app) {
  const cur = await latest(c, app);
  if (!cur) return 'Record an assessment before sending the application for decision.';
  if (!cur.current) return 'The latest recommendation no longer matches the application. Recalculate or record a new assessment.';
  if (cur.recommendation.outcome === 'incomplete') return 'The assessment is incomplete (a criterion needs information). Request the information first.';
  return null;
}

/**
 * The decision-maker records the decision. Refused if the caller recorded any assessment of this application, if the
 * recommendation is out of date, or if the outcome contradicts it. The decision moves the application state.
 */
async function decide(appId, user, { outcome, reasons, conditions = [] }) {
  needStaff(user);
  if (!DECISIONS.includes(outcome)) throw new ApplicationError('Choose a decision.');
  if (!String(reasons || '').trim()) throw new ApplicationError('The reasons for the decision are required.');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    if (app.state !== 'awaiting_decision') throw new ApplicationError(`A decision can be recorded only while the application is awaiting decision (it is ${app.state}).`, 409);
    const { rows: assessors } = await c.query('SELECT 1 FROM partner_assessments WHERE application_id = $1 AND assessor_user_id = $2 LIMIT 1', [app.id, user.id]);
    if (assessors.length) throw new ApplicationError('You recorded an assessment of this application, so you cannot decide it. Another decision-maker must.', 403);
    const blocked = await readyForDecision(c, app);
    if (blocked) throw new ApplicationError(blocked, 409);
    const { assessment, recommendation } = await latest(c, app);
    if (outcome !== 'declined') {
      const ok = recommendation.outcome === 'accept' ? ['accepted', 'accepted_with_conditions'] : recommendation.outcome === 'accept_with_conditions' ? ['accepted_with_conditions'] : [];
      if (!ok.includes(outcome)) throw new ApplicationError(`The recommendation is "${recommendation.outcome}", so this decision is not available. Decline, or send the application back for correction.`, 409);
    }
    const conds = (conditions || []).map((k) => ({ text: String(k.text || '').trim().slice(0, 2000), blocking: !!k.blocking, due: k.due_date ? String(k.due_date) : null })).filter((k) => k.text);
    if (outcome === 'accepted_with_conditions' && !conds.length) throw new ApplicationError('Add at least one condition.');
    if (outcome !== 'accepted_with_conditions' && conds.length) throw new ApplicationError('Conditions belong only to an acceptance with conditions.');
    for (const k of conds) {
      if (k.due && !DATE_RE.test(k.due)) throw new ApplicationError('Condition due dates must be dates.');
      if (!k.blocking && !k.due) throw new ApplicationError('A non-blocking condition needs a due date.');
    }
    const { rows: [d] } = await c.query(`INSERT INTO partner_application_decisions (application_id, recommendation_id, outcome, reasons, criteria_version, version, decided_by, decided_by_label)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [app.id, recommendation.id, outcome, String(reasons).trim().slice(0, 4000), assessment.criteria_version, assessment.version, user.id, user.email]);
    for (const k of conds) await c.query('INSERT INTO partner_application_conditions (decision_id, text, blocking, due_date) VALUES ($1,$2,$3,$4)', [d.id, k.text, k.blocking, k.due]);
    await event(c, app, outcome === 'declined' ? 'declined' : 'accepted_pending_activation', user, `${outcome}: ${String(reasons).trim().slice(0, 300)}`);
    return d;
  });
}

/** Everything the review screen needs. */
async function review(appId) {
  const { rows: [app] } = await q('SELECT a.*, p.company_name, p.country FROM partner_applications a JOIN platforms p ON p.id = a.platform_id WHERE a.id = $1', [appId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  const [versions, evidence, events, assessments, findings, recs, decisions, conditions] = await Promise.all([
    q('SELECT version, form, criteria_version, submitted_at FROM partner_application_versions WHERE application_id = $1 ORDER BY version', [appId]),
    q('SELECT id, version, criterion, filename, content_type, bytes, sha256, created_at FROM partner_application_evidence WHERE application_id = $1 ORDER BY created_at', [appId]),
    q('SELECT from_state, to_state, version, actor_label, reason, created_at FROM partner_application_events WHERE application_id = $1 ORDER BY created_at, id', [appId]),
    q('SELECT * FROM partner_assessments WHERE application_id = $1 ORDER BY created_at', [appId]),
    q('SELECT f.* FROM partner_assessment_findings f JOIN partner_assessments a ON a.id = f.assessment_id WHERE a.application_id = $1', [appId]),
    q('SELECT r.* FROM partner_recommendations r JOIN partner_assessments a ON a.id = r.assessment_id WHERE a.application_id = $1 ORDER BY r.created_at', [appId]),
    q('SELECT * FROM partner_application_decisions WHERE application_id = $1 ORDER BY created_at', [appId]),
    q('SELECT k.* FROM partner_application_conditions k JOIN partner_application_decisions d ON d.id = k.decision_id WHERE d.application_id = $1', [appId]),
  ]);
  const { rows: [set] } = await q('SELECT criteria FROM partner_criteria_sets WHERE version = $1', [app.criteria_version]);
  const cur = await tx((c) => latest(c, app));
  return { app, criteria: set?.criteria || [], versions: versions.rows, evidence: evidence.rows, events: events.rows, assessments: assessments.rows,
    findings: findings.rows, recommendations: recs.rows, decisions: decisions.rows, conditions: conditions.rows, latest: cur };
}

module.exports = { CRITERIA, RESULTS, DECISIONS, recommend, inputHash, recordAssessment, recalculate, readyForDecision, decide, review };
