// Staff positions (Batch E). Permission comes from the position held through an individual account, read from the
// database on every call; the user object a caller passes is only used for its id. Accounts with no position
// (the owner admin) cannot assess, decide or activate, and a vacant account cannot sign in or act.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const { ApplicationError } = require('./applications');

const PERMS = { assess: 'can_assess', decide: 'can_decide', activate: 'can_activate' };
const LABEL = { assess: 'assess applications', decide: 'decide applications', activate: 'activate providers' };
const VACANT_DOMAIN = 'positions.liv.invalid'; // reserved TLD: can never receive mail or be a real address
const norm = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Throws 403 unless this account holds a position with the permission. Returns the position code. */
async function require_(user, perm) {
  const col = PERMS[perm];
  if (!col || !user?.id) throw new ApplicationError('Only LIV staff can make this change.', 403);
  const { rows: [r] } = await q(`SELECT u.staff_position, p.${col} AS allowed FROM users u JOIN staff_positions p ON p.code = u.staff_position
    WHERE u.id = $1 AND u.role = 'super_admin' AND NOT u.vacant`, [user.id]);
  if (!r?.allowed) throw new ApplicationError(`Your account's position does not allow you to ${LABEL[perm]}.`, 403);
  return r.staff_position;
}

/** What the signed-in staff account may do, for screens (never a substitute for require()). */
async function can(user) {
  if (!user?.id) return { assess: false, decide: false, activate: false };
  const { rows: [r] } = await q(`SELECT p.can_assess, p.can_decide, p.can_activate FROM users u JOIN staff_positions p ON p.code = u.staff_position
    WHERE u.id = $1 AND u.role = 'super_admin' AND NOT u.vacant`, [user.id]);
  return { assess: !!r?.can_assess, decide: !!r?.can_decide, activate: !!r?.can_activate };
}

/** Creates one vacant account for every position that has none. Safe to run at every start. */
async function ensureVacantAccounts() {
  const { rows } = await q(`SELECT p.code, p.title FROM staff_positions p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.staff_position = p.code)`);
  for (const p of rows) {
    const username = `${p.code.replace(/_/g, '.')}@${VACANT_DOMAIN}`;
    await q(`INSERT INTO users (role, full_name, email, password_hash, staff_position, vacant) VALUES ('super_admin', $1, $2, $3, $4, true) ON CONFLICT (email) DO NOTHING`,
      [`${p.title} (vacant)`, username, `!vacant-${crypto.randomBytes(16).toString('hex')}`, p.code]);
  }
  return rows.length;
}

async function list() {
  const { rows } = await q(`SELECT p.*, u.id AS user_id, u.full_name, u.email, u.vacant, u.totp_enabled, u.last_login_at
    FROM staff_positions p LEFT JOIN users u ON u.staff_position = p.code ORDER BY p.code, u.vacant DESC, u.created_at`);
  return rows;
}

/**
 * Appoints a person to a vacant position account: real name, real email, a temporary password shown once.
 * One person cannot hold two of the separated positions under different accounts (same name is refused).
 */
async function appoint(userId, actor, { full_name, email }) {
  const name = String(full_name || '').trim().slice(0, 200), mail = String(email || '').trim().toLowerCase();
  if (!name) throw new ApplicationError('Enter the person\'s full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.endsWith(`@${VACANT_DOMAIN}`)) throw new ApplicationError('Enter the person\'s real email address.');
  return tx(async (c) => {
    const { rows: [u] } = await c.query('SELECT id, staff_position, vacant FROM users WHERE id = $1 AND staff_position IS NOT NULL FOR UPDATE', [userId]);
    if (!u) throw new ApplicationError('Position account not found.', 404);
    if (!u.vacant) throw new ApplicationError('This position is already held. Release it first.', 409);
    const { rows: held } = await c.query('SELECT full_name, staff_position FROM users WHERE staff_position IS NOT NULL AND NOT vacant AND staff_position <> $1', [u.staff_position]);
    if (held.some((h) => norm(h.full_name) === norm(name))) throw new ApplicationError('This person already holds another position. Assessing, deciding and activating must be done by different people.', 409);
    if ((await c.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [mail, u.id])).rows.length) throw new ApplicationError('That email already has an account.', 409);
    const temp = crypto.randomBytes(12).toString('base64url');
    await c.query('UPDATE users SET full_name = $2, email = $3, password_hash = $4, vacant = false, must_change_password = true, totp_enabled = false, totp_secret_enc = NULL, recovery_hashes = \'{}\' WHERE id = $1',
      [u.id, name, mail, await bcrypt.hash(temp, 12)]);
    await audit({ user: actor, action: 'staff.appoint', target: u.staff_position, metadata: { email: mail } }, c);
    return { temp, email: mail, position: u.staff_position };
  });
}

/** Returns a position to vacant: the person's access ends at once. Their past records keep their name. */
async function release(userId, actor) {
  return tx(async (c) => {
    const { rows: [u] } = await c.query('SELECT id, staff_position, vacant FROM users WHERE id = $1 AND staff_position IS NOT NULL FOR UPDATE', [userId]);
    if (!u) throw new ApplicationError('Position account not found.', 404);
    if (u.vacant) throw new ApplicationError('This position is already vacant.', 409);
    const { rows: [p] } = await c.query('SELECT code, title FROM staff_positions WHERE code = $1', [u.staff_position]);
    const old = (await c.query('SELECT email FROM users WHERE id = $1', [u.id])).rows[0].email;
    await c.query('UPDATE users SET vacant = true, password_hash = $2, totp_enabled = false, totp_secret_enc = NULL, recovery_hashes = \'{}\', full_name = $3, email = $4 WHERE id = $1',
      [u.id, `!vacant-${crypto.randomBytes(16).toString('hex')}`, `${p.title} (vacant)`, `${p.code.replace(/_/g, '.')}@${VACANT_DOMAIN}`]);
    await audit({ user: actor, action: 'staff.release', target: u.staff_position, metadata: { email: old } }, c);
    return u.id;
  }).then(async (id) => { await q(`DELETE FROM sessions WHERE sess->>'userId' = $1`, [id]).catch(() => {}); });
}

module.exports = { require: require_, can, ensureVacantAccounts, list, appoint, release, VACANT_DOMAIN };
