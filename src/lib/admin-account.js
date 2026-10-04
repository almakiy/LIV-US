// Create or reset a super admin login. Shared by scripts/reset-admin.js and the start-up bootstrap.
const bcrypt = require('bcryptjs');
const { q } = require('../db');

/** Returns 'created' | 'reset'. Throws on a weak password or when the email belongs to a provider user. */
async function setAdminPassword(email, password) {
  if (String(password || '').length < 10) throw new Error('Password must be at least 10 characters.');
  const hash = await bcrypt.hash(password, 12);
  const { rows: [u] } = await q('SELECT id, role FROM users WHERE email = $1', [email]);
  if (u && u.role !== 'super_admin') throw new Error(`${email} belongs to a provider account; choose another admin email.`);
  if (u) await q('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, u.id]);
  else await q("INSERT INTO users (role, full_name, email, password_hash) VALUES ('super_admin','LIV Administrator',$1,$2)", [email, hash]);
  await q('DELETE FROM sessions').catch(() => {});
  return u ? 'reset' : 'created';
}
module.exports = { setAdminPassword };
