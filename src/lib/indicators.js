// Monitoring indicators and audit cases (docs/DECISIONS.md §1 and Batch H). An indicator opens a case for one provider.
// The case asks the provider to respond within 5 working days; with no response by 10 working days it is escalated to the
// Authorization Decision-Maker. A case never revokes a credential, suspends a provider or changes an authorization.
// The thresholds below are the approved values. They are constants, not screen settings.
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { queueToPlatform } = require('./email');
const { addBusinessDays, iso } = require('./qms');
const { includedFor } = require('./billing');
const { hasNonLatin } = require('./issuance');
const { ApplicationError } = require('./applications');
const P = require('./positions');

const T = { volumeMultiple: 5, allowanceShare: 0.5, refusedBatches: 3, complaints: 3, windowDays: 90, respondBusinessDays: 5, escalateBusinessDays: 10 };
const TRIGGERS = {
  volume_spike: 'A batch is at least 5 times the monthly average',
  half_allowance: 'A batch is more than half the included allowance',
  refused_batches: '3 batches refused or sent back in 90 days',
  complaints: '3 complaints in 90 days',
};
const OUTCOMES = { no_action: 'No action needed', corrective_action: 'Corrective action required', referred_to_review: 'Referred for a wider review' };
const OWNER = { open: 'partner_relations', responded: 'application_assessor', escalated: 'authorization_decision_maker' };

/** Batch indicators that apply to one upload. Pure: returns trigger codes. */
function batchTriggers({ issued, monthlyAverage, included }) {
  const out = [];
  if (monthlyAverage > 0 && issued >= T.volumeMultiple * monthlyAverage) out.push('volume_spike');
  if (included > 0 && issued > T.allowanceShare * included) out.push('half_allowance');
  return out;
}

/** Count indicators (refused batches, complaints) fire at the threshold within the window. Pure. */
const countTriggered = (count, threshold) => count >= threshold;

/** Wording of the notice, with the figures that caused it. Pure. */
function describe(trigger, d) {
  if (trigger === 'volume_spike') return `A batch of ${d.issued} certificates is at least ${T.volumeMultiple} times your average monthly issuance of ${d.average} over the previous 12 months.`;
  if (trigger === 'half_allowance') return `A batch of ${d.issued} certificates is more than half of your included allowance of ${d.included}.`;
  if (trigger === 'refused_batches') return `${d.count} batch uploads were refused or sent back for correction in the last ${T.windowDays} days.`;
  return `${d.count} complaints about your training were received in the last ${T.windowDays} days.`;
}

const caseNo = (now) => `MC-${iso(now).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

/** Opens a case unless the same indicator already has one. Count indicators wait 90 days; batch indicators are per batch. */
async function openCase(platformId, trigger, sourceRef, detail, { windowed = false } = {}) {
  // The preview provider is a test account: its activity never opens an audit case.
  const { rows: [pv] } = await q('SELECT is_preview FROM platforms WHERE id = $1', [platformId]);
  if (pv?.is_preview) return null;
  const { rows: [dup] } = await q(`SELECT 1 FROM partner_audit_cases WHERE platform_id = $1 AND trigger_code = $2
    AND (source_ref = $3 OR ($4 AND opened_at > now() - ($5::int * interval '1 day'))) LIMIT 1`, [platformId, trigger, sourceRef, windowed, T.windowDays]);
  if (dup) return null;
  const now = new Date();
  const respondDue = iso(addBusinessDays(now, T.respondBusinessDays));
  const escalateDue = iso(addBusinessDays(now, T.escalateBusinessDays));
  const text = describe(trigger, detail);
  const { rows: [c] } = await q(`INSERT INTO partner_audit_cases (case_no, platform_id, trigger_code, source_ref, detail, response_due, escalate_due)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (platform_id, trigger_code, source_ref) DO NOTHING RETURNING *`,
  [caseNo(now), platformId, trigger, sourceRef, JSON.stringify(detail), respondDue, escalateDue]);
  if (!c) return null;
  await q(`INSERT INTO partner_audit_events (case_id, event, note) VALUES ($1, 'opened', $2)`, [c.id, `${TRIGGERS[trigger]}. ${text}`]);
  await audit({ actorLabel: 'system', platformId, action: 'audit_case.open', target: c.id, metadata: { trigger, source: sourceRef } });
  await queueToPlatform(platformId, 'status_update', {
    title: `Monitoring notice ${c.case_no}`,
    message: `LIV opened a monitoring case because: ${text} This is a request for information, not a finding. Please respond in the partner portal by ${respondDue} (5 working days). If there is no response by ${escalateDue} (10 working days), the case is referred to the Authorization Decision-Maker.`,
    url: '/portal/oversight', label: 'Respond in the portal',
  }, `audit-open:${c.id}`).catch(() => {});
  return c;
}

/** Runs the batch indicators for one upload that was issued. Returns the cases opened. */
async function checkBatch(platformId, batchId) {
  const { rows: [b] } = await q('SELECT id, issued FROM issuance_batches WHERE id = $1 AND platform_id = $2', [batchId, platformId]);
  if (!b) return [];
  const { rows: [p] } = await q('SELECT plan, included_certificates FROM platforms WHERE id = $1', [platformId]);
  // The monthly average uses the 12 full calendar months before this one, so the batch itself is not counted in it.
  const { rows: [h] } = await q(`SELECT count(*)::int AS n FROM certificates WHERE platform_id = $1
    AND created_at >= date_trunc('month', now()) - interval '12 months' AND created_at < date_trunc('month', now())`, [platformId]);
  const average = Math.round((h.n / 12) * 10) / 10;
  const included = includedFor(p);
  const opened = [];
  for (const trigger of batchTriggers({ issued: b.issued, monthlyAverage: average, included })) {
    const c = await openCase(platformId, trigger, `batch:${b.id}`, { issued: b.issued, average, included });
    if (c) opened.push(c);
  }
  return opened;
}

/** Records an upload that was refused (no valid rows, or issuance refused). Then runs the count indicators. */
async function recordRefusal(platformId, { source, fileName, reason }) {
  await q('INSERT INTO issuance_refusals (platform_id, source, file_name, reason) VALUES ($1,$2,$3,$4)', [platformId, source, fileName || null, String(reason || '').slice(0, 500)]);
  await checkPlatform(platformId).catch((e) => console.warn(`[indicators] ${e.message}`));
}

/** Count indicators for one provider: refused uploads and complaints in the window. */
async function checkPlatform(platformId) {
  const { rows: [r] } = await q(`SELECT
    (SELECT count(*)::int FROM issuance_refusals WHERE platform_id = $1 AND created_at > now() - ($2::int * interval '1 day')) AS refused,
    (SELECT count(*)::int FROM qms_cases WHERE platform_id = $1 AND kind = 'complaint' AND received_at > now() - ($2::int * interval '1 day')) AS complaints`, [platformId, T.windowDays]);
  const opened = [];
  const day = iso(new Date());
  if (countTriggered(r.refused, T.refusedBatches)) { const c = await openCase(platformId, 'refused_batches', `window:${day}`, { count: r.refused }, { windowed: true }); if (c) opened.push(c); }
  if (countTriggered(r.complaints, T.complaints)) { const c = await openCase(platformId, 'complaints', `window:${day}`, { count: r.complaints }, { windowed: true }); if (c) opened.push(c); }
  return opened;
}

/** Scheduled run: count indicators for every provider with recent activity, and escalation of cases past 10 working days. */
async function sweep() {
  const { rows: plats } = await q(`SELECT platform_id AS id FROM issuance_refusals WHERE created_at > now() - ($1::int * interval '1 day')
    UNION SELECT platform_id FROM qms_cases WHERE kind = 'complaint' AND platform_id IS NOT NULL AND received_at > now() - ($1::int * interval '1 day')`, [T.windowDays]);
  for (const p of plats) await checkPlatform(p.id).catch((e) => console.warn(`[indicators] ${e.message}`));
  const { rows: escalated } = await q(`UPDATE partner_audit_cases SET status = 'escalated', updated_at = now() WHERE status = 'open' AND escalate_due < current_date RETURNING id, platform_id`);
  for (const e of escalated) await q(`INSERT INTO partner_audit_events (case_id, event, note) VALUES ($1, 'escalated', 'No response within 10 working days; referred to the Authorization Decision-Maker')`, [e.id]);
  return escalated.length;
}

/** The provider answers the notice. Allowed while the case waits for it (open or escalated). */
async function respond(caseId, platformId, user, text) {
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) throw new ApplicationError('Write your response.');
  if (hasNonLatin(body)) throw new ApplicationError('Write your response in English (Latin letters). LIV does not translate or convert text.');
  return tx(async (c) => {
    const { rows: [k] } = await c.query('SELECT * FROM partner_audit_cases WHERE id = $1 AND platform_id = $2 FOR UPDATE', [caseId, platformId]);
    if (!k) throw new ApplicationError('Case not found.', 404);
    if (!['open', 'escalated'].includes(k.status)) throw new ApplicationError('This case is not waiting for a response.', 409);
    await c.query(`UPDATE partner_audit_cases SET status = 'responded', response = $2, responded_at = now(), updated_at = now() WHERE id = $1`, [caseId, body]);
    await c.query(`INSERT INTO partner_audit_events (case_id, actor_label, event, note) VALUES ($1, $2, 'responded', 'Provider response received')`, [caseId, user?.email || 'provider']);
    await audit({ user, platformId, action: 'audit_case.respond', target: caseId }, c);
  });
}

/** Closes a case with an outcome and a note. A responded case is closed by the assessor; an escalated one by the decision-maker. */
async function close(caseId, user, { outcome, note }) {
  return tx(async (c) => {
    const { rows: [k] } = await c.query('SELECT * FROM partner_audit_cases WHERE id = $1 FOR UPDATE', [caseId]);
    if (!k) throw new ApplicationError('Case not found.', 404);
    if (k.status === 'open') throw new ApplicationError('Wait for the provider response or the escalation before closing this case.', 409);
    if (k.status === 'closed') throw new ApplicationError('This case is already closed.', 409);
    await P.require(user, k.status === 'responded' ? 'assess' : 'decide');
    if (!OUTCOMES[outcome]) throw new ApplicationError('Choose an outcome.');
    const text = String(note || '').trim().slice(0, 4000);
    if (!text) throw new ApplicationError('Record the reasons for the outcome.');
    await c.query(`UPDATE partner_audit_cases SET status = 'closed', outcome = $2, closing_note = $3, closed_at = now(), closed_by_label = $4, updated_at = now() WHERE id = $1`,
      [caseId, outcome, text, user.email]);
    await c.query(`INSERT INTO partner_audit_events (case_id, actor_label, event, note) VALUES ($1, $2, 'closed', $3)`, [caseId, user.email, `${OUTCOMES[outcome]}. ${text}`]);
    await audit({ user, platformId: k.platform_id, action: 'audit_case.close', target: caseId, metadata: { outcome } }, c);
  });
}

/** Open cases for the work queue. Each row says which position owns the next step. */
async function openForQueue() {
  const { rows } = await q(`SELECT c.id, c.case_no, c.status, c.trigger_code, c.updated_at AS since, c.escalate_due, p.company_name
    FROM partner_audit_cases c JOIN platforms p ON p.id = c.platform_id WHERE c.status <> 'closed'`);
  return rows.map((r) => ({ ...r, owner: OWNER[r.status] }));
}

async function list() {
  return (await q(`SELECT c.*, p.company_name FROM partner_audit_cases c JOIN platforms p ON p.id = c.platform_id
    ORDER BY (c.status <> 'closed') DESC, c.opened_at DESC LIMIT 300`)).rows;
}

async function get(id) {
  const { rows: [k] } = await q(`SELECT c.*, p.company_name FROM partner_audit_cases c JOIN platforms p ON p.id = c.platform_id WHERE c.id = $1`, [id]);
  if (!k) throw new ApplicationError('Case not found.', 404);
  const { rows: events } = await q('SELECT * FROM partner_audit_events WHERE case_id = $1 ORDER BY at, id', [id]);
  return { ...k, events, owner: OWNER[k.status], text: TRIGGERS[k.trigger_code] };
}

async function forProvider(platformId) {
  return (await q(`SELECT id, case_no, status, trigger_code, opened_at, response_due, escalate_due, response, responded_at, outcome, closing_note, closed_at
    FROM partner_audit_cases WHERE platform_id = $1 ORDER BY opened_at DESC`, [platformId])).rows
    .map((r) => ({ ...r, text: TRIGGERS[r.trigger_code] }));
}

module.exports = { T, TRIGGERS, OUTCOMES, OWNER, batchTriggers, countTriggered, describe, checkBatch, recordRefusal, checkPlatform, sweep, respond, close, openForQueue, list, get, forProvider };
