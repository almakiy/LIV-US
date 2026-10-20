// Public directory records (October 20, 2026 decisions). A provider proposes public details and branches; LIV reviews them.
// The published values stay as they are until a change is approved. Scope details are recorded by LIV only. Every decision
// checks the staff position on the server (positions.require) and is written to the audit log with the before and after values.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError } = require('./applications');
const { hasNonLatin } = require('./issuance');
const P = require('./positions');

const PROFILE = {
  public_about: { label: 'About', max: 1000, english: true },
  website: { label: 'Website', max: 255, url: true },
  public_social: { label: 'Professional links', max: 500, links: true },
  public_city: { label: 'City', max: 120, english: true },
  public_domain: { label: 'Training domain', max: 200, english: true },
  public_delivery: { label: 'Delivery method', max: 200, english: true },
};
const SCOPE_FIELDS = {
  scope_number: { label: 'Scope number', max: 30 },
  domain: { label: 'Domain', max: 500, english: true },
  boundaries: { label: 'Boundaries', max: 1000, english: true },
  restrictions: { label: 'Restrictions', max: 1000, english: true },
  delivery_methods: { label: 'Delivery methods', max: 300, english: true },
};
const BRANCH = { name: { label: 'Branch name', max: 200 }, address: { label: 'Address', max: 300 }, city: { label: 'City', max: 120 }, country: { label: 'Country', max: 100 } };

const squash = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(u);

/** Reads and checks the public details a provider proposes. Returns { fields, errors }. Empty values are stored as null. */
function readProfile(body = {}) {
  const fields = {}; const errors = [];
  for (const [key, rule] of Object.entries(PROFILE)) {
    let v = squash(body[key], rule.max);
    if (rule.links) {
      const items = String(body[key] ?? '').split(/\s+/).filter(Boolean);
      if (items.length > 5) errors.push(`${rule.label}: give at most five links.`);
      if (items.some((u) => !isHttpUrl(u))) errors.push(`${rule.label}: each link must start with https:// or http://.`);
      v = items.join(' ').slice(0, rule.max);
    }
    if (rule.url && v && !isHttpUrl(v)) errors.push(`${rule.label}: enter an address that starts with https:// or http://.`);
    if (rule.english && hasNonLatin(v)) errors.push(`${rule.label}: write in English (Latin letters). LIV does not translate or convert text.`);
    fields[key] = v || null;
  }
  return { fields, errors };
}

/** Proposes a change to the public details. Refused if nothing changed or a change is already waiting. */
async function proposeProfile(platformId, user, body) {
  const { fields, errors } = readProfile(body);
  if (errors.length) throw new ApplicationError(errors.join(' '));
  const { rows: [p] } = await q(`SELECT ${Object.keys(PROFILE).join(', ')} FROM platforms WHERE id = $1`, [platformId]);
  if (Object.keys(PROFILE).every((k) => (p[k] || null) === fields[k])) throw new ApplicationError('Nothing has changed from the published details.', 409);
  return tx(async (c) => {
    const { rows: [pending] } = await c.query(`SELECT id FROM provider_profile_revisions WHERE platform_id = $1 AND status = 'pending' FOR UPDATE`, [platformId]);
    if (pending) throw new ApplicationError('A change is already waiting for LIV review. Wait for the decision before proposing another.', 409);
    const { rows: [r] } = await c.query(`INSERT INTO provider_profile_revisions (platform_id, fields, submitted_by) VALUES ($1,$2,$3) RETURNING *`, [platformId, JSON.stringify(fields), user.id]);
    await audit({ user, platformId, action: 'profile.propose', target: r.id }, c);
    return r;
  });
}

/** Staff decision on a proposed profile. Approval publishes the fields; the earlier published values are replaced only now. */
async function decideProfile(id, user, { outcome, note }) {
  await P.require(user, 'assess');
  if (!['approved', 'rejected'].includes(outcome)) throw new ApplicationError('Choose approve or reject.');
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) throw new ApplicationError('Record the reason for the decision.');
  return tx(async (c) => {
    const { rows: [r] } = await c.query(`SELECT * FROM provider_profile_revisions WHERE id = $1 FOR UPDATE`, [id]);
    if (!r) throw new ApplicationError('Change not found.', 404);
    if (r.status !== 'pending') throw new ApplicationError('This change was already decided.', 409);
    if (outcome === 'approved') {
      const f = r.fields;
      await c.query(`UPDATE platforms SET website = $2, public_about = $3, public_social = $4, public_city = $5, public_domain = $6, public_delivery = $7 WHERE id = $1`,
        [r.platform_id, f.website, f.public_about, f.public_social, f.public_city, f.public_domain, f.public_delivery]);
    }
    await c.query(`UPDATE provider_profile_revisions SET status = $2, decided_by_label = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [id, outcome, user.email, text]);
    await audit({ user, platformId: r.platform_id, action: `profile.${outcome}`, target: id }, c);
  });
}

/** Scope details recorded by LIV. Each change raises the scope revision; the audit entry keeps before and after. */
async function updateScope(scopeId, user, body) {
  await P.require(user, 'decide');
  const values = {}; const errors = [];
  for (const [key, rule] of Object.entries(SCOPE_FIELDS)) {
    const v = squash(body[key], rule.max);
    if (rule.english && hasNonLatin(v)) errors.push(`${rule.label}: write in English (Latin letters).`);
    values[key] = v;
  }
  if (errors.length) throw new ApplicationError(errors.join(' '));
  return tx(async (c) => {
    const { rows: [s] } = await c.query('SELECT * FROM partner_scopes WHERE id = $1 FOR UPDATE', [scopeId]);
    if (!s) throw new ApplicationError('Scope not found.', 404);
    const before = Object.fromEntries(Object.keys(SCOPE_FIELDS).map((k) => [k, s[k]]));
    const { rows: [u] } = await c.query(`UPDATE partner_scopes SET scope_number = $2, domain = $3, boundaries = $4, restrictions = $5, delivery_methods = $6,
      revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING *`, [scopeId, values.scope_number || null, values.domain, values.boundaries, values.restrictions, values.delivery_methods]);
    await audit({ user, platformId: s.platform_id, action: 'scope.details', target: scopeId, metadata: { revision: u.revision, before, after: values } }, c);
    return u;
  });
}

/** A provider requests a branch: name and address, and the scopes it wants, each with the delivery methods it proposes. */
async function requestBranch(platformId, user, body) {
  const values = {}; const errors = [];
  for (const [key, rule] of Object.entries(BRANCH)) {
    values[key] = squash(body[key], rule.max);
    if (!values[key] && (key === 'name' || key === 'address')) errors.push(`${rule.label}: required.`);
    if (hasNonLatin(values[key])) errors.push(`${rule.label}: write in English (Latin letters).`);
  }
  const wanted = [].concat(body.scope_ids || []).map(String);
  if (!wanted.length) errors.push('Choose at least one authorized scope for this branch.');
  if (errors.length) throw new ApplicationError(errors.join(' '));
  const { rows: scopes } = await q(`SELECT id, delivery_methods FROM partner_scopes WHERE platform_id = $1 AND status = 'active' AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`, [platformId]);
  const allowed = new Set(scopes.map((s) => s.id));
  if (wanted.some((id) => !allowed.has(id))) throw new ApplicationError('A chosen scope is not active for this provider.');
  return tx(async (c) => {
    const { rows: [b] } = await c.query(`INSERT INTO partner_branches (platform_id, name, address, city, country, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [platformId, values.name, values.address, values.city, values.country, user.id]);
    for (const id of wanted) {
      const methods = squash(body[`delivery_${id}`], 300);
      if (hasNonLatin(methods)) throw new ApplicationError('Delivery methods: write in English (Latin letters).');
      await c.query(`INSERT INTO partner_branch_scopes (branch_id, scope_id, delivery_methods) VALUES ($1,$2,$3)`, [b.id, id, methods]);
    }
    await audit({ user, platformId, action: 'branch.request', target: b.id }, c);
    return b;
  });
}

async function withdrawBranch(id, platformId, user) {
  const { rowCount } = await q(`UPDATE partner_branches SET status = 'withdrawn', decided_at = now(), decided_by_label = $3 WHERE id = $1 AND platform_id = $2 AND status = 'requested'`, [id, platformId, user.email]);
  if (!rowCount) throw new ApplicationError('Only a branch request that is still waiting can be withdrawn.', 409);
}

/** LIV decides a branch. A branch is approved for the scopes LIV marks as approved; other requested scopes are not covered. */
async function decideBranch(id, user, { outcome, note, scopes }) {
  await P.require(user, 'decide');
  if (!['approved', 'refused'].includes(outcome)) throw new ApplicationError('Choose approve or refuse.');
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) throw new ApplicationError('Record the reason for the decision.');
  const approve = outcome === 'approved' ? [].concat(scopes || []).filter((s) => s && s.approve) : [];
  if (outcome === 'approved' && !approve.length) throw new ApplicationError('Approve at least one scope for this branch.');
  return tx(async (c) => {
    const { rows: [b] } = await c.query('SELECT * FROM partner_branches WHERE id = $1 FOR UPDATE', [id]);
    if (!b) throw new ApplicationError('Branch request not found.', 404);
    if (b.status !== 'requested') throw new ApplicationError('This branch request was already decided.', 409);
    await c.query(`UPDATE partner_branch_scopes SET approved = false WHERE branch_id = $1`, [id]);
    for (const s of approve) {
      const methods = squash(s.delivery_methods, 300);
      if (hasNonLatin(methods)) throw new ApplicationError('Delivery methods: write in English (Latin letters).');
      const { rowCount } = await c.query(`UPDATE partner_branch_scopes SET approved = true, delivery_methods = $3 WHERE branch_id = $1 AND scope_id = $2`, [id, s.scope_id, methods]);
      if (!rowCount) throw new ApplicationError('A scope chosen for approval was not requested for this branch.');
    }
    await c.query(`UPDATE partner_branches SET status = $2, decided_at = now(), decided_by_label = $3, decision_note = $4 WHERE id = $1`, [id, outcome, user.email, text]);
    await audit({ user, platformId: b.platform_id, action: `branch.${outcome}`, target: id, metadata: { scopes: approve.map((s) => s.scope_id) } }, c);
  });
}

/** Branches as shown publicly: approved branches, each with only the scopes approved for it. */
async function publicBranches(platformId) {
  const { rows } = await q(`SELECT b.id, b.name, b.address, b.city, b.country, s.id AS scope_id, s.title AS scope_title, bs.delivery_methods
    FROM partner_branches b JOIN partner_branch_scopes bs ON bs.branch_id = b.id AND bs.approved JOIN partner_scopes s ON s.id = bs.scope_id
    WHERE b.platform_id = $1 AND b.status = 'approved' AND s.status = 'active' AND (s.ends_on IS NULL OR s.ends_on >= CURRENT_DATE)
    ORDER BY b.name, s.title`, [platformId]);
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, address: r.address, city: r.city, country: r.country, scopes: [] });
    byId.get(r.id).scopes.push({ id: r.scope_id, title: r.scope_title, delivery_methods: r.delivery_methods });
  }
  return [...byId.values()];
}

/** Courses under a scope: authorized course titles recorded against it, with their request reference and revision. */
async function coursesFor(scopeId) {
  return (await q(`SELECT id, title, revision FROM partner_title_requests WHERE scope_id = $1 AND status = 'authorized' ORDER BY title`, [scopeId])).rows
    .map((r) => ({ title: r.title, reference: `T-${r.id.slice(0, 8).toUpperCase()}`, revision: r.revision }));
}

/** The provider's own view: published details, the change waiting, and its branches with their status. */
async function providerView(platformId) {
  const { rows: [p] } = await q(`SELECT website, public_about, public_social, public_city, public_domain, public_delivery FROM platforms WHERE id = $1`, [platformId]);
  const { rows: [pending] } = await q(`SELECT id, fields, submitted_at FROM provider_profile_revisions WHERE platform_id = $1 AND status = 'pending'`, [platformId]);
  const { rows: last } = await q(`SELECT status, decision_note, decided_at FROM provider_profile_revisions WHERE platform_id = $1 AND status <> 'pending' ORDER BY decided_at DESC LIMIT 1`, [platformId]);
  const { rows: branches } = await q(`SELECT id, name, address, city, country, status, decision_note, requested_at FROM partner_branches WHERE platform_id = $1 ORDER BY requested_at DESC`, [platformId]);
  const { rows: scopes } = await q(`SELECT id, title, scope_number FROM partner_scopes WHERE platform_id = $1 AND status = 'active' AND (ends_on IS NULL OR ends_on >= CURRENT_DATE) ORDER BY title`, [platformId]);
  return { published: p, pending, lastDecision: last[0] || null, branches, scopes };
}

/** Staff view: every waiting change and branch request, with the published values for comparison. */
async function staffQueue() {
  const { rows: profiles } = await q(`SELECT r.id, r.fields, r.submitted_at, p.company_name, p.website, p.public_about, p.public_social, p.public_city, p.public_domain, p.public_delivery
    FROM provider_profile_revisions r JOIN platforms p ON p.id = r.platform_id WHERE r.status = 'pending' ORDER BY r.submitted_at`);
  const { rows: branches } = await q(`SELECT b.id, b.name, b.address, b.city, b.country, b.requested_at, p.company_name FROM partner_branches b JOIN platforms p ON p.id = b.platform_id WHERE b.status = 'requested' ORDER BY b.requested_at`);
  const { rows: requested } = await q(`SELECT bs.branch_id, bs.scope_id, bs.delivery_methods, bs.approved, s.title, s.scope_number FROM partner_branch_scopes bs JOIN partner_scopes s ON s.id = bs.scope_id
    WHERE bs.branch_id = ANY($1::uuid[])`, [branches.map((b) => b.id)]);
  const { rows: scopes } = await q(`SELECT s.id, s.title, s.scope_number, s.domain, s.boundaries, s.restrictions, s.delivery_methods, s.revision, s.status, s.granted_on, s.ends_on, p.company_name
    FROM partner_scopes s JOIN platforms p ON p.id = s.platform_id WHERE s.status = 'active' ORDER BY p.company_name, s.title LIMIT 300`);
  return { profiles, branches: branches.map((b) => ({ ...b, scopes: requested.filter((r) => r.branch_id === b.id) })), scopes };
}

module.exports = { PROFILE, SCOPE_FIELDS, BRANCH, readProfile, proposeProfile, decideProfile, updateScope, requestBranch, withdrawBranch, decideBranch, publicBranches, coursesFor, providerView, staffQueue };
