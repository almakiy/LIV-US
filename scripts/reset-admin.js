// Sets (or creates) a super admin login. Use when you cannot log in.
//   ADMIN_EMAIL    default: SEED_ADMIN_EMAIL or admin@liv.local
//   ADMIN_PASSWORD default: SEED_ADMIN_PASSWORD; if unset a random password is generated and printed once
// Example (shared database schema): PG_SCHEMA=liv_github_preview npm run reset-admin
require('../src/config');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, q } = require('../src/db');

(async () => {
  const email = (process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || 'admin@liv.local').trim().toLowerCase();
  const given = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  const password = given || `${crypto.randomBytes(9).toString('base64url')}Aa1`;
  if (password.length < 10) throw new Error('Password must be at least 10 characters.');
  const hash = await bcrypt.hash(password, 12);
  const { rows: [u] } = await q('SELECT id, role FROM users WHERE email = $1', [email]);
  if (u && u.role !== 'super_admin') throw new Error(`${email} belongs to a provider account; choose another ADMIN_EMAIL.`);
  if (u) await q('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, u.id]);
  else await q("INSERT INTO users (role, full_name, email, password_hash) VALUES ('super_admin','LIV Administrator',$1,$2)", [email, hash]);
  await q('DELETE FROM sessions').catch(() => {});
  console.log(`${u ? 'Password reset' : 'Admin created'} for ${email}`);
  if (!given) console.log(`Password (shown once): ${password}`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
