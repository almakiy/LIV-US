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
// Individual previews: one without and one with a (granted, unpaid) preview membership.
const INDIVIDUALS = {
  basic: { email: `individual.basic@${PREVIEW_DOMAIN}`, name: 'Preview Individual (no membership)', available: true },
  member: { email: `individual.member@${PREVIEW_DOMAIN}`, name: 'Preview Individual (with membership)', available: true, member: true },
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
  if (d.member) await require('./memberships').grantPreview(user, n.id);
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

/**
 * Clears everything entered while using the preview accounts, so test data is never kept: the preview provider's records,
 * applications, requests, invoices and files, and the preview individuals' links, requests, memberships, invoices and messages.
 * Kept: the preview accounts themselves (provider, scope, template, individuals, the granted preview membership), the check
 * log, and the append-only audit log, which records who did what and cannot be edited.
 */
async function resetData(user, reason = 'manual') {
  const fs = require('fs'); const path = require('path');
  const { validKey } = require('./files');
  const p = await partner();
  const { rows: people } = await q(`SELECT id, email FROM users WHERE role = 'individual' AND is_preview`);
  const ids = people.map((x) => x.id);
  const counts = {};
  const files = await tx(async (c) => {
    await c.query(`SET LOCAL liv.preview_reset = 'on'`);
    const del = async (label, sql, params) => { const r = await c.query(sql, params); counts[label] = (counts[label] || 0) + r.rowCount; };
    let keys = [];
    if (p) {
      keys = (await c.query(`SELECT pdf_path AS key FROM certificates WHERE platform_id = $1 AND pdf_path IS NOT NULL
        UNION SELECT logo_path FROM platforms WHERE id = $1 AND logo_path IS NOT NULL`, [p.id])).rows.map((r) => r.key);
      if (keys.length) await c.query('DELETE FROM stored_files WHERE key = ANY($1::text[])', [keys]);
      await del('verifications', 'DELETE FROM verification_logs WHERE certificate_id IN (SELECT id FROM certificates WHERE platform_id = $1)', [p.id]);
      await del('records', 'DELETE FROM certificates WHERE platform_id = $1', [p.id]);
      await del('payments', 'DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE platform_id = $1)', [p.id]);
      await del('invoices', 'DELETE FROM invoices WHERE platform_id = $1', [p.id]);
      await c.query(`DELETE FROM email_outbox WHERE platform_id = $1`, [p.id]);
      // Every other table that belongs to the provider: delete its rows, repeating until dependencies are cleared.
      const { rows: tables } = await c.query(`SELECT DISTINCT cl.relname AS t FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.conrelid
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY(k.conkey)
        WHERE k.contype = 'f' AND k.confrelid = 'platforms'::regclass AND a.attname = 'platform_id' AND cl.relname NOT IN ('audit_logs','certificate_templates','partner_scopes')`);
      let left = tables.map((r) => r.t);
      for (let pass = 0; pass < 6 && left.length; pass++) {
        const next = [];
        for (const t of left) {
          await c.query('SAVEPOINT s');
          try { const r = await c.query(`DELETE FROM ${t} WHERE platform_id = $1`, [p.id]); counts[t] = (counts[t] || 0) + r.rowCount; await c.query('RELEASE SAVEPOINT s'); }
          catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); next.push(t); }
        }
        left = next;
      }
      if (left.length) throw new Error(`Preview reset could not clear: ${left.join(', ')}`);
      // Back to the starting setup: one preview scope, one preview template, no profile changes.
      await c.query(`DELETE FROM partner_scopes WHERE platform_id = $1 AND title <> $2`, [p.id, SCOPE_TITLE]);
      await c.query(`UPDATE partner_scopes SET status = 'active', ends_on = NULL WHERE platform_id = $1`, [p.id]);
      await c.query(`DELETE FROM certificate_templates WHERE platform_id = $1 AND name <> 'Preview template'`, [p.id]);
      const { rows: cols } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'platforms' AND is_nullable = 'YES'
        AND column_name = ANY($1::text[])`, [['logo_path', 'website', 'public_city', 'public_domain', 'public_delivery', 'public_about', 'public_social', 'billing_name', 'billing_email', 'billing_address', 'tax_id', 'contact_phone']]);
      if (cols.length) await c.query(`UPDATE platforms SET ${cols.map((x) => `${x.column_name} = NULL`).join(', ')} WHERE id = $1`, [p.id]);
      await c.query(`UPDATE platforms SET accreditation_status = 'active', service_hold = false WHERE id = $1`, [p.id]);
    }
    if (ids.length) {
      await del('links', 'DELETE FROM credential_claims WHERE user_id = ANY($1::uuid[])', [ids]);
      await del('link requests', 'DELETE FROM credential_claim_requests WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query('DELETE FROM individual_emails WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query('DELETE FROM individual_tokens WHERE user_id = ANY($1::uuid[])', [ids]);
      await del('purchases', 'DELETE FROM resource_purchases WHERE user_id = ANY($1::uuid[])', [ids]);
      await del('registrations', 'DELETE FROM event_registrations WHERE user_id = ANY($1::uuid[])', [ids]);
      await del('contributions', 'DELETE FROM contributions WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query('DELETE FROM communication_consents WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query('DELETE FROM program_interest WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query(`UPDATE gifts SET status = 'void' WHERE buyer_user_id = ANY($1::uuid[]) OR accepted_user_id = ANY($1::uuid[])`, [ids]);
      await del('gifts', `DELETE FROM gifts WHERE buyer_user_id = ANY($1::uuid[]) OR accepted_user_id = ANY($1::uuid[]) OR recipient_email LIKE '%@' || $2`, [ids, PREVIEW_DOMAIN]);
      await del('group packs', 'DELETE FROM group_packs WHERE manager_user_id = ANY($1::uuid[])', [ids]);
      await c.query(`UPDATE group_seats SET user_id = NULL, membership_id = NULL WHERE user_id = ANY($1::uuid[])`, [ids]);
      await c.query(`DELETE FROM memberships WHERE user_id = ANY($1::uuid[]) AND NOT (source = 'grant' AND is_preview AND status = 'active')`, [ids]);
      await del('payments', 'DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = ANY($1::uuid[]))', [ids]);
      await del('invoices', 'DELETE FROM invoices WHERE user_id = ANY($1::uuid[])', [ids]);
      await del('messages', 'DELETE FROM contact_messages WHERE user_id = ANY($1::uuid[])', [ids]);
      await c.query(`UPDATE users SET marketing_opt_in = false, marketing_opt_in_at = NULL, newsletter_opt_in = false, newsletter_topics = '{}', card_show_name = false, closure_requested_at = NULL WHERE id = ANY($1::uuid[])`, [ids]);
      for (const d of Object.values(INDIVIDUALS)) await c.query('UPDATE users SET full_name = $1 WHERE lower(email) = $2', [d.name, d.email]);
    }
    await c.query(`DELETE FROM email_outbox WHERE to_email LIKE '%@' || $1`, [PREVIEW_DOMAIN]);
    await audit({ user, action: 'preview.reset', target: reason, metadata: counts }, c);
    return keys;
  });
  for (const key of files) if (validKey(key)) fs.rmSync(path.join(cfg.storageDir, ...key.split('/')), { force: true });
  return counts;
}

/** True when the preview accounts hold any data entered while using them. */
async function hasData() {
  const { rows: [r] } = await q(`SELECT
    (SELECT count(*)::int FROM certificates c JOIN platforms p ON p.id = c.platform_id WHERE p.is_preview)
    + (SELECT count(*)::int FROM credential_claims cl JOIN users u ON u.id = cl.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM invoices i LEFT JOIN platforms p ON p.id = i.platform_id LEFT JOIN users u ON u.id = i.user_id WHERE p.is_preview OR u.is_preview)
    + (SELECT count(*)::int FROM credential_claim_requests r JOIN users u ON u.id = r.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM contact_messages m JOIN users u ON u.id = m.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM individual_emails e JOIN users u ON u.id = e.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.is_preview AND NOT (m.source = 'grant' AND m.status = 'active'))
    + (SELECT count(*)::int FROM api_keys k JOIN platforms p ON p.id = k.platform_id WHERE p.is_preview)
    + (SELECT count(*)::int FROM partner_applications a JOIN platforms p ON p.id = a.platform_id WHERE p.is_preview)
    + (SELECT count(*)::int FROM partner_title_requests t JOIN platforms p ON p.id = t.platform_id WHERE p.is_preview)
    + (SELECT count(*)::int FROM issuance_batches b JOIN platforms p ON p.id = b.platform_id WHERE p.is_preview)
    + (SELECT count(*)::int FROM resource_purchases x JOIN users u ON u.id = x.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM event_registrations x JOIN users u ON u.id = x.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM contributions x JOIN users u ON u.id = x.user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM group_packs x JOIN users u ON u.id = x.manager_user_id WHERE u.is_preview)
    + (SELECT count(*)::int FROM gifts x JOIN users u ON u.id = x.buyer_user_id OR u.id = x.accepted_user_id WHERE u.is_preview) AS n`);
  return r.n > 0;
}

module.exports.resetData = resetData;
module.exports.hasData = hasData;
