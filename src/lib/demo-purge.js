// Removal of the demo partner that `npm run seed` creates, so its sample credentials never verify on a public server.
// Used by scripts/purge-demo.js and Admin > System. Records that others depend on stay (the partner row, its users,
// invoices, the append-only audit log): the partner is suspended and its users locked instead of deleted.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { validKey } = require('./files');
const { DEMO_PARTNER } = require('./dev-defaults');

/** The seeded demo partner (name, contact email and its user all match), or null. Throws if several match. */
async function findDemo() {
  const { rows } = await q(`SELECT p.id, p.company_name, p.accreditation_status FROM platforms p
    WHERE p.company_name = $1 AND p.contact_email = $2 AND EXISTS (SELECT 1 FROM users u WHERE u.platform_id = p.id AND u.email = $2)`, [DEMO_PARTNER.company, DEMO_PARTNER.email]);
  if (rows.length > 1) throw new Error(`${rows.length} partners match the demo identity; resolve this by hand.`);
  return rows[0] || null;
}

/** What a removal would change. */
async function preview(p) {
  const { rows: [n] } = await q(`SELECT
      (SELECT count(*)::int FROM certificates WHERE platform_id = $1) AS credentials,
      (SELECT count(*)::int FROM issuance_batches WHERE platform_id = $1) AS batches,
      (SELECT count(*)::int FROM trainees WHERE platform_id = $1) AS trainees,
      (SELECT count(*)::int FROM certificate_templates WHERE platform_id = $1) AS templates,
      (SELECT count(*)::int FROM api_keys WHERE platform_id = $1 AND revoked_at IS NULL) AS "apiKeys",
      (SELECT count(*)::int FROM users WHERE platform_id = $1) AS users,
      (SELECT count(*)::int FROM invoices WHERE platform_id = $1) AS invoices`, [p.id]);
  return n;
}

/** Deletes the demo credentials with their files and verification logs, suspends the partner, locks its users. */
async function purge(p, { user, actorLabel } = {}) {
  const n = await preview(p);
  const keys = await tx(async (c) => {
    const { rows: files } = await c.query(`SELECT pdf_path AS key FROM certificates WHERE platform_id = $1 AND pdf_path IS NOT NULL
      UNION SELECT logo_path FROM platforms WHERE id = $1 AND logo_path IS NOT NULL`, [p.id]);
    if ((await c.query("SELECT to_regclass('stored_files') IS NOT NULL AS ok")).rows[0].ok) {
      await c.query('DELETE FROM stored_files WHERE key = ANY($1::text[])', [files.map((f) => f.key)]);
    }
    await c.query('DELETE FROM verification_logs WHERE certificate_id IN (SELECT id FROM certificates WHERE platform_id = $1)', [p.id]);
    for (const t of ['certificates', 'issuance_batches', 'trainees', 'certificate_templates']) await c.query(`DELETE FROM ${t} WHERE platform_id = $1`, [p.id]);
    await c.query('UPDATE api_keys SET revoked_at = now() WHERE platform_id = $1 AND revoked_at IS NULL', [p.id]);
    // Users stay (the audit log refers to them) but can no longer sign in: their password becomes an unknown random value.
    const { rows: users } = await c.query('SELECT id FROM users WHERE platform_id = $1', [p.id]);
    for (const u of users) await c.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12), u.id]);
    if ((await c.query("SELECT to_regclass('sessions') IS NOT NULL AS ok")).rows[0].ok) {
      await c.query("DELETE FROM sessions WHERE sess->>'userId' = ANY($1::text[]) OR sess->>'actAs' = $2", [users.map((u) => u.id), p.id]);
    }
    await c.query("UPDATE platforms SET accreditation_status = 'suspended', logo_path = NULL WHERE id = $1", [p.id]);
    await audit({ user, actorLabel, platformId: p.id, action: 'demo.purge', target: p.id, metadata: n }, c);
    return files.map((f) => f.key);
  });
  for (const key of keys) if (validKey(key)) fs.rmSync(path.join(cfg.storageDir, ...key.split('/')), { force: true });
  return n;
}

module.exports = { findDemo, preview, purge };
