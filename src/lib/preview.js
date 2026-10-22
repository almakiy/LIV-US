// Preview accounts: a preview training provider and preview individuals that the main account opens to try new features and
// to run periodic checks. Preview records stay out of the public register and verify as "preview record", never as credentials.
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { certHmac, randomToken } = require('./crypto');

const PARTNER_NAME = 'LIV Preview Training Provider';
const PREVIEW_DOMAIN = 'preview.liv.invalid';
const SCOPE_TITLE = 'Preview Course (test records only)';
// Individual previews. 'member' becomes available with the membership batch (M2).
const INDIVIDUALS = {
  basic: { email: `individual.basic@${PREVIEW_DOMAIN}`, name: 'Preview Individual (no membership)', available: true },
  member: { email: `individual.member@${PREVIEW_DOMAIN}`, name: 'Preview Individual (with membership)', available: false, note: 'Available once memberships are built (M2).' },
};

async function partner() {
  const { rows: [p] } = await q(`SELECT p.id, p.company_name, p.accreditation_status, p.public_number,
      (SELECT count(*)::int FROM certificates c WHERE c.platform_id = p.id) AS records,
      (SELECT count(*)::int FROM partner_scopes s WHERE s.platform_id = p.id AND s.status = 'active') AS scopes
    FROM platforms p WHERE p.is_preview`);
  return p || null;
}

async function ensurePartner(user) {
  const existing = await partner();
  if (existing) return existing;
  await tx(async (c) => {
    const { rows: [p] } = await c.query(`INSERT INTO platforms (company_name, country, contact_email, accreditation_status, is_preview)
      VALUES ($1,'United States',$2,'active',true) RETURNING id`, [PARTNER_NAME, `partner@${PREVIEW_DOMAIN}`]);
    await c.query(`INSERT INTO partner_scopes (platform_id, title, status, decision_note, created_by) VALUES ($1,$2,'active','Preview scope for testing; not an authorization.',$3)`,
      [p.id, SCOPE_TITLE, user.id]);
    await c.query(`INSERT INTO certificate_templates (platform_id, name, design, signatory_name, signatory_title, security_config) VALUES ($1,'Preview template','executive','Preview Signatory','Test only',$2)`,
      [p.id, require('./pdf-security').RECOMMENDED]);
    await audit({ user, platformId: p.id, action: 'preview.partner_create', target: PARTNER_NAME }, c);
  });
  return partner();
}

async function individuals() {
  const { rows } = await q(`SELECT u.id, u.email, u.full_name, (SELECT count(*)::int FROM credential_claims cl WHERE cl.user_id = u.id AND cl.released_at IS NULL) AS linked
    FROM users u WHERE u.role = 'individual' AND u.is_preview`);
  return Object.entries(INDIVIDUALS).map(([key, d]) => ({ key, ...d, account: rows.find((r) => r.email === d.email) || null }));
}

async function ensureIndividual(user, key) {
  const d = INDIVIDUALS[key];
  if (!d || !d.available) throw new Error('This preview is not available yet.');
  const { rows: [u] } = await q('SELECT id FROM users WHERE lower(email) = $1', [d.email]);
  if (u) return u.id;
  // The password is random and never shown: a preview individual is opened only from the main account.
  const { rows: [n] } = await q(`INSERT INTO users (role, full_name, email, password_hash, email_verified_at, is_preview) VALUES ('individual',$1,$2,$3, now(), true) RETURNING id`,
    [d.name, d.email, await bcrypt.hash(randomToken(), 10)]);
  await audit({ user, action: 'preview.individual_create', target: d.email });
  return n.id;
}

/** Automatic technical checks. Each returns { area, ok, detail }. Nothing here changes data. */
async function runChecks() {
  const out = [];
  const add = (area, ok, detail) => out.push({ area, ok: Boolean(ok), detail });
  try { await q('SELECT 1'); add('Database', true, 'Reachable.'); } catch (e) { add('Database', false, e.message); return out; }
  const p = await partner();
  add('Preview provider', p && p.accreditation_status === 'active' && p.scopes > 0, p ? `Status ${p.accreditation_status}, ${p.scopes} active scope(s), ${p.records} record(s).` : 'Not created yet.');
  const { rows: [pub] } = await q(`SELECT count(*)::int AS n FROM platforms p WHERE p.is_preview AND ${require('./provider-public').PUBLIC_FILTER}`);
  add('Preview provider hidden from the public register', pub.n === 0, pub.n ? 'Shown publicly.' : 'Not listed.');
  if (p) {
    const { rows: certs } = await q(`SELECT * FROM certificates WHERE platform_id = $1 ORDER BY created_at DESC LIMIT 50`, [p.id]);
    const bad = certs.filter((c) => certHmac({ cert_number: c.cert_number, platform_id: c.platform_id, first_name: c.recipient_first_name, last_name: c.recipient_last_name,
      email: c.recipient_email, course_name: c.course_name, grade: c.grade, completion_date: c.completion_date, issue_date: c.issue_date, expiry_date: c.expiry_date }) !== c.verification_hash);
    add('Preview records: integrity', bad.length === 0, certs.length ? `${certs.length - bad.length} of ${certs.length} recent record(s) match their signature.` : 'No preview records yet. Issue one from the preview provider.');
  }
  const people = await individuals();
  const basic = people.find((x) => x.key === 'basic');
  add('Preview individual (no membership)', Boolean(basic.account), basic.account ? `${basic.account.linked} linked record(s).` : 'Not created yet.');
  const { rows: [em] } = await q(`SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*) FILTER (WHERE status = 'queued')::int AS queued FROM email_outbox`);
  add('Email queue', em.failed === 0, `${em.queued} queued, ${em.failed} failed. Driver: ${cfg.emailDriver || 'not set'}.`);
  for (const path of ['/', '/verify', '/partners', '/login', '/credentials']) {
    try {
      const r = await fetch(`http://127.0.0.1:${cfg.port}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
      add(`Public page ${path}`, r.status === 200, `HTTP ${r.status}`);
    } catch (e) { add(`Public page ${path}`, false, e.message); }
  }
  return out;
}

async function recordRun(user, results) {
  const run = require('crypto').randomUUID();
  for (const r of results) {
    await q(`INSERT INTO preview_checks (area, result, detail, automatic, run_id, checked_by) VALUES ($1,$2,$3,true,$4,$5)`, [r.area.slice(0, 80), r.ok ? 'pass' : 'fail', String(r.detail || '').slice(0, 1000), run, user.id]);
  }
  await audit({ user, action: 'preview.checks_run', target: `${results.filter((r) => !r.ok).length} failed of ${results.length}` });
  return run;
}

async function recordManual(user, { area, result, detail }) {
  const a = String(area || '').trim(); const d = String(detail || '').trim();
  if (!a || !['pass', 'fail', 'note'].includes(result)) throw new Error('Choose an area and a result.');
  await q(`INSERT INTO preview_checks (area, result, detail, checked_by) VALUES ($1,$2,$3,$4)`, [a.slice(0, 80), result, d.slice(0, 1000), user.id]);
}

async function history() {
  const { rows } = await q(`SELECT c.*, u.full_name FROM preview_checks c LEFT JOIN users u ON u.id = c.checked_by ORDER BY c.checked_at DESC, c.id LIMIT 120`);
  return rows;
}

module.exports = { PARTNER_NAME, PREVIEW_DOMAIN, SCOPE_TITLE, INDIVIDUALS, partner, ensurePartner, individuals, ensureIndividual, runChecks, recordRun, recordManual, history };
