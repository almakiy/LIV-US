// Standards versions (Batch H). A new version of the authorization criteria is published by a decision-maker; it applies to
// applications created after publication. Applications already open keep the version they started on (the transition rule
// is pending decision P-9). The criteria codes C1 to C9 must stay the same and in order, because assessments record one
// finding per code. Only the titles and the 'if not met' rules may change.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError } = require('./applications');
const { hasNonLatin } = require('./issuance');
const P = require('./positions');

const CODES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];
const VERSION_RE = /^v\d{1,3}\.\d{1,3}$/;

/** Checks a criteria list. Returns an error message or null. Pure. */
function validateCriteria(list) {
  if (!Array.isArray(list)) return 'The criteria must be a list.';
  if (list.length !== CODES.length || list.some((c, i) => c?.code !== CODES[i])) return `The criteria must be ${CODES.join(', ')}, in that order.`;
  for (const c of list) {
    if (!String(c.title || '').trim()) return `${c.code}: give the criterion a title.`;
    if (!String(c.if_not_met || '').trim()) return `${c.code}: say how a failure is classed.`;
    if (hasNonLatin(c.title) || hasNonLatin(c.if_not_met)) return `${c.code}: write in English (Latin letters).`;
  }
  return null;
}

/** Parses the pasted criteria. Returns the list or throws. */
function parseCriteria(text) {
  let list;
  try { list = JSON.parse(String(text || '')); } catch { throw new ApplicationError('The criteria are not valid JSON.'); }
  const err = validateCriteria(list);
  if (err) throw new ApplicationError(err);
  return list.map((c) => ({ code: c.code, title: String(c.title).trim().slice(0, 200), if_not_met: String(c.if_not_met).trim().slice(0, 200) }));
}

async function publish(user, { version, criteria }) {
  await P.require(user, 'decide');
  const v = String(version || '').trim();
  if (!VERSION_RE.test(v)) throw new ApplicationError('Use a version such as v0.2.');
  const list = parseCriteria(criteria);
  return tx(async (c) => {
    if ((await c.query('SELECT 1 FROM partner_criteria_sets WHERE version = $1', [v])).rows.length) throw new ApplicationError(`Version ${v} already exists.`, 409);
    await c.query(`UPDATE partner_criteria_sets SET status = 'retired' WHERE status = 'in_force'`);
    await c.query(`INSERT INTO partner_criteria_sets (version, status, criteria) VALUES ($1, 'in_force', $2)`, [v, JSON.stringify(list)]);
    await audit({ user, action: 'standards.publish', target: v }, c);
    return v;
  });
}

async function versions() {
  return (await q('SELECT version, status, criteria, created_at FROM partner_criteria_sets ORDER BY created_at DESC')).rows;
}

module.exports = { CODES, validateCriteria, parseCriteria, publish, versions };
