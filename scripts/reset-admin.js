// Sets (or creates) a super admin login. Use when you cannot log in.
//   ADMIN_EMAIL    default: SEED_ADMIN_EMAIL or admin@liv.local
//   ADMIN_PASSWORD default: SEED_ADMIN_PASSWORD; if unset a random password is generated and printed once
// Example (shared database schema): PG_SCHEMA=liv_github_preview npm run reset-admin
// No shell? Set the ADMIN_RESET_PASSWORD secret and restart the app instead (see src/lib/bootstrap.js).
require('../src/config');
const crypto = require('crypto');
const { pool } = require('../src/db');
const { setAdminPassword } = require('../src/lib/admin-account');

(async () => {
  const email = (process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || 'admin@liv.local').trim().toLowerCase();
  const given = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  const password = given || `${crypto.randomBytes(9).toString('base64url')}Aa1`;
  const what = await setAdminPassword(email, password);
  console.log(`${what === 'reset' ? 'Password reset' : 'Admin created'} for ${email}`);
  if (!given) console.log(`Password (shown once): ${password}`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
