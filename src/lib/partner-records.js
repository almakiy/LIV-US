// Partner records (Batch H): renewals, material-change notices and sanctions screening. Staff actions check the position on
// every call (positions.require). A provider can only send a material-change notice for its own account.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError } = require('./applications');
const { hasNonLatin } = require('./issuance');
const { isoDate } = require('./qms');
const P = require('./positions');

const CHANGE_KINDS = {
  legal_entity: 'Legal entity or name',
  ownership_or_control: 'Ownership or control',
  contact_or_address: 'Contact or address',
  trainers: 'Trainers',
  courses_or_scope: 'Courses or scope',
  delivery_method: 'Delivery method',
  other: 'Other',
};
const CHANGE_STATUS = { submitted: 'Waiting for LIV', acknowledged: 'Acknowledged', review_opened: 'Review opened' };
const SANCTION_RESULTS = { no_match: 'No match', possible_match: 'Possible match', match: 'Match' };
const RESULT_LIST = /^[\x20-\x7e]{2,200}$/; // English text only (Latin letters, digits and punctuation)

const today = () => new Date().toISOString().slice(0, 10);

// ----- renewals (the renewal period is pending decision P-11; LIV sets the due date by hand) -----
async function scheduleRenewal(platformId, user, { due_on, note }) {
  await P.require(user, 'assess');
  const due = isoDate(due_on);
  if (!due) throw new ApplicationError('Enter the due date as YYYY-MM-DD.');
  const text = String(note || '').trim().slice(0, 2000);
  try {
    const { rows: [r] } = await q(`INSERT INTO partner_renewals (platform_id, due_on, note, set_by_label) VALUES ($1,$2,$3,$4) RETURNING *`, [platformId, due, text, user.email]);
    await audit({ user, platformId, action: 'renewal.schedule', target: r.id, metadata: { due_on: due } });
    return r;
  } catch (e) {
    if (e.code === '23505') throw new ApplicationError('This provider already has a renewal scheduled. Record its outcome first.', 409);
    throw e;
  }
}

async function decideRenewal(id, user, { outcome, note }) {
  await P.require(user, 'decide');
  if (!['renewed', 'lapsed'].includes(outcome)) throw new ApplicationError('Choose renewed or lapsed.');
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) throw new ApplicationError('Record the reason for the outcome.');
  return tx(async (c) => {
    const { rows: [r] } = await c.query(`SELECT * FROM partner_renewals WHERE id = $1 FOR UPDATE`, [id]);
    if (!r) throw new ApplicationError('Renewal not found.', 404);
    if (r.status !== 'scheduled') throw new ApplicationError('This renewal already has an outcome.', 409);
    // A lapsed renewal is recorded only. It does not change the provider's status: that is a separate decision.
    const { rows: [u] } = await c.query(`UPDATE partner_renewals SET status = $2, note = $3, decided_at = now(), decided_by_label = $4 WHERE id = $1 RETURNING *`, [id, outcome, text, user.email]);
    await audit({ user, platformId: r.platform_id, action: 'renewal.decide', target: id, metadata: { outcome } }, c);
    return u;
  });
}

// ----- material-change notices (the categories and the threshold for material are pending decision P-12) -----
/** The decision-maker has seen a lapsed renewal. Only the queue item is cleared; the provider status does not change. */
async function reviewLapsed(id, user) {
  await P.require(user, 'decide');
  const { rows: [r] } = await q(`UPDATE partner_renewals SET reviewed_at = now(), reviewed_by_label = $2 WHERE id = $1 AND status = 'lapsed' AND reviewed_at IS NULL RETURNING platform_id`, [id, user.email]);
  if (!r) throw new ApplicationError('No lapsed renewal is waiting for review.', 409);
  await audit({ user, platformId: r.platform_id, action: 'renewal.review_lapsed', target: id });
}

async function recordChange(platformId, user, { change_kind, description, effective_on }) {
  if (!CHANGE_KINDS[change_kind]) throw new ApplicationError('Choose the kind of change.');
  const text = String(description || '').trim().slice(0, 4000);
  if (!text) throw new ApplicationError('Describe the change.');
  if (hasNonLatin(text)) throw new ApplicationError('Write the description in English (Latin letters). LIV does not translate or convert text.');
  const eff = effective_on ? isoDate(effective_on) : null;
  if (effective_on && !eff) throw new ApplicationError('Enter the effective date as YYYY-MM-DD.');
  const { rows: [r] } = await q(`INSERT INTO partner_material_changes (platform_id, change_kind, description, effective_on, submitted_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [platformId, change_kind, text, eff, user.id]);
  await audit({ user, platformId, action: 'change_notice.submit', target: r.id, metadata: { kind: change_kind } });
  return r;
}

async function handleChange(id, user, { outcome, note }) {
  await P.require(user, 'assess');
  if (!['acknowledged', 'review_opened'].includes(outcome)) throw new ApplicationError('Choose acknowledged or review opened.');
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) throw new ApplicationError('Record what LIV decided about the notice.');
  return tx(async (c) => {
    const { rows: [r] } = await c.query('SELECT * FROM partner_material_changes WHERE id = $1 FOR UPDATE', [id]);
    if (!r) throw new ApplicationError('Notice not found.', 404);
    if (r.status !== 'submitted') throw new ApplicationError('This notice was already handled.', 409);
    await c.query(`UPDATE partner_material_changes SET status = $2, handling_note = $3, handled_by_label = $4, handled_at = now() WHERE id = $1`, [id, outcome, text, user.email]);
    await audit({ user, platformId: r.platform_id, action: 'change_notice.handle', target: id, metadata: { outcome } }, c);
  });
}

// ----- sanctions screening (a record of a check against a list named by the screener; the list is chosen by LIV) -----
async function recordSanctions(platformId, user, { list_name, checked_on, result, note }) {
  await P.require(user, 'assess');
  const name = String(list_name || '').trim();
  if (!RESULT_LIST.test(name)) throw new ApplicationError('Name the list checked, in English.');
  const day = checked_on ? isoDate(checked_on) : today();
  if (!day) throw new ApplicationError('Enter the check date as YYYY-MM-DD.');
  if (!SANCTION_RESULTS[result]) throw new ApplicationError('Choose the result.');
  const { rows: [r] } = await q(`INSERT INTO partner_sanctions_checks (platform_id, list_name, checked_on, result, checked_by_label, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [platformId, name, day, result, user.email, String(note || '').trim().slice(0, 2000)]);
  await audit({ user, platformId, action: 'sanctions.record', target: r.id, metadata: { result } });
  return r;
}

async function list() {
  const { rows: renewals } = await q(`SELECT r.*, p.company_name FROM partner_renewals r JOIN platforms p ON p.id = r.platform_id ORDER BY (r.status = 'scheduled') DESC, r.due_on`);
  const { rows: changes } = await q(`SELECT c.*, p.company_name FROM partner_material_changes c JOIN platforms p ON p.id = c.platform_id ORDER BY (c.status = 'submitted') DESC, c.submitted_at DESC LIMIT 200`);
  const { rows: sanctions } = await q(`SELECT s.*, p.company_name FROM partner_sanctions_checks s JOIN platforms p ON p.id = s.platform_id ORDER BY s.created_at DESC LIMIT 200`);
  const { rows: platforms } = await q(`SELECT id, company_name FROM platforms ORDER BY company_name`);
  return { renewals, changes, sanctions, platforms };
}

/** Records waiting for a position: overdue renewals, notices not yet acknowledged, and unresolved possible matches. */
async function openForQueue() {
  const { rows: overdue } = await q(`SELECT r.id, r.due_on AS since, to_char(r.due_on, 'YYYY-MM-DD') AS due, p.company_name FROM partner_renewals r JOIN platforms p ON p.id = r.platform_id WHERE r.status = 'scheduled' AND r.due_on < current_date`);
  const { rows: lapsed } = await q(`SELECT r.id, r.decided_at AS since, p.company_name FROM partner_renewals r JOIN platforms p ON p.id = r.platform_id WHERE r.status = 'lapsed' AND r.reviewed_at IS NULL`);
  const { rows: notices } = await q(`SELECT c.id, c.submitted_at AS since, c.change_kind, p.company_name FROM partner_material_changes c JOIN platforms p ON p.id = c.platform_id WHERE c.status = 'submitted'`);
  const { rows: matches } = await q(`SELECT s.id, s.created_at AS since, s.list_name, p.company_name FROM partner_sanctions_checks s JOIN platforms p ON p.id = s.platform_id
    WHERE s.result <> 'no_match' AND NOT EXISTS (SELECT 1 FROM partner_sanctions_checks n WHERE n.platform_id = s.platform_id AND n.created_at > s.created_at)`);
  return [
    ...overdue.map((r) => ({ kind: 'Renewal', what: `due ${r.due}`, who: r.company_name, owner: 'authorization_decision_maker', since: r.since, url: '/admin/partner-records' })),
    ...lapsed.map((r) => ({ kind: 'Lapsed renewal', what: 'review the record; the provider status is unchanged', who: r.company_name, owner: 'authorization_decision_maker', since: r.since, url: '/admin/partner-records' })),
    ...notices.map((r) => ({ kind: 'Material change', what: CHANGE_KINDS[r.change_kind], who: r.company_name, owner: 'application_assessor', since: r.since, url: '/admin/partner-records' })),
    ...matches.map((r) => ({ kind: 'Sanctions check', what: `possible match on ${r.list_name}`, who: r.company_name, owner: 'application_assessor', since: r.since, url: '/admin/partner-records' })),
  ];
}

async function changesFor(platformId) {
  return (await q(`SELECT id, change_kind, description, effective_on, status, submitted_at, handling_note, handled_at FROM partner_material_changes WHERE platform_id = $1 ORDER BY submitted_at DESC`, [platformId])).rows;
}

module.exports = { CHANGE_KINDS, CHANGE_STATUS, SANCTION_RESULTS, scheduleRenewal, decideRenewal, reviewLapsed, recordChange, handleChange, recordSanctions, list, openForQueue, changesFor };
