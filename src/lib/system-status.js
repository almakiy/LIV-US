// Read-only health checks for Admin > System status. Secrets are reported as set or not set, never shown.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { q } = require('../db');
const files = require('./files');
const { DEMO_PARTNER } = require('./dev-defaults');

const ROOT = path.join(__dirname, '..', '..');
const STARTED = new Date();
const TARGET_URL = 'https://livcredentials.org';

/** The commit this server runs, read from .git without calling git (absent on some hosts). */
function gitVersion() {
  try {
    const dir = path.join(ROOT, '.git');
    const head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return { commit: head.slice(0, 7), branch: '(detached)' };
    const ref = head.slice(5);
    const loose = path.join(dir, ...ref.split('/'));
    const sha = fs.existsSync(loose) ? fs.readFileSync(loose, 'utf8').trim()
      : (fs.readFileSync(path.join(dir, 'packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`)) || '').split(' ')[0];
    return { commit: (sha || '').slice(0, 7) || null, branch: ref.replace('refs/heads/', '') };
  } catch { return { commit: null, branch: null }; }
}

const stripeMode = (k) => (!k ? 'not configured' : /^(sk|rk)_live_/.test(k) ? 'live' : /^(sk|rk)_test_/.test(k) ? 'test' : 'set (mode unknown)');
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** Returns { sections: [{ title, rows: [{ item, value, state: ok|warn|bad|info, note }] }], storage }. */
async function collect() {
  const deployed = cfg.isDeployed;
  const row = (item, value, state = 'info', note = '') => ({ item, value, state, note });
  const v = gitVersion();
  const isDefault = (k, dev) => !process.env[k] || process.env[k] === dev; // unset means the development default from config.js
  const devSession = isDefault('SESSION_SECRET', 'dev-session-secret-change-me'); const devHmac = isDefault('CERT_HMAC_SECRET', 'dev-hmac-secret-change-me');
  const { rows: [counts] } = await q(`SELECT
      (SELECT count(*)::int FROM users WHERE role = 'super_admin' AND NOT totp_enabled) AS admins_no_2fa,
      (SELECT count(*)::int FROM platforms WHERE company_name = $1 AND contact_email = $2 AND accreditation_status = 'active') AS demo,
      current_setting('server_version') AS pg, pg_database_size(current_database())::bigint AS db_bytes`, [DEMO_PARTNER.company, DEMO_PARTNER.email]);
  const storage = await files.health();

  const sections = [
    { title: 'Site', rows: [
      row('Running version', v.commit ? `${v.commit} (${v.branch})` : 'unknown', 'info', 'Compare with the latest commit on GitHub to confirm the deployment is up to date.'),
      row('Server started', STARTED.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'),
      row('Public base URL', cfg.baseUrl, deployed && !cfg.baseUrl.startsWith('https://') ? 'warn' : cfg.baseUrl === TARGET_URL ? 'ok' : 'info',
        `QR codes and verification links print this address. ${cfg.baseUrl === TARGET_URL ? '' : `Set PUBLIC_BASE_URL=${TARGET_URL} once the domain is live, before issuing real credentials.`}`),
      row('Mode', `${cfg.isProd ? 'production' : `NODE_ENV=${process.env.NODE_ENV || '(not set)'}`}${process.env.REPLIT_DEPLOYMENT === '1' ? ', Replit deployment' : ''}`,
        deployed && !cfg.isProd ? 'warn' : 'info', deployed && !cfg.isProd ? 'Set NODE_ENV=production on the deployment (secure cookies, required secrets).' : ''),
    ] },
    { title: 'Secrets (values are never shown)', rows: [
      row('CERT_HMAC_SECRET', devHmac ? 'development default in use' : 'set', devHmac ? (deployed ? 'bad' : 'info') : 'ok',
        'Signs every credential. Keep an offline copy. Changing it makes every credential already issued fail verification: read docs/BUILD-PLAN.md (0.6) before any change.'),
      row('SESSION_SECRET', devSession ? 'development default in use' : 'set', devSession ? (deployed ? 'bad' : 'info') : 'ok', 'Signs sign-in sessions; changing it signs everyone out.'),
      row('TOTP_ENCRYPTION_KEY', process.env.TOTP_ENCRYPTION_KEY ? 'set' : 'not set (derived from CERT_HMAC_SECRET)', 'info',
        'Do not add or change it while anyone uses two-factor sign-in: their codes would stop working.'),
    ] },
    { title: 'Sign-in security', rows: [
      row('Two-factor policy (REQUIRE_2FA)', cfg.require2fa || 'optional', cfg.require2fa ? 'ok' : deployed ? 'warn' : 'info', 'Recommended: admin now, all before the first paying partner.'),
      row('LIV administrators without two-factor sign-in', String(counts.admins_no_2fa), counts.admins_no_2fa ? 'warn' : 'ok'),
      row('Published development passwords', deployed ? 'refused at sign-in' : 'accepted (development server)', deployed ? 'ok' : 'info'),
      row('Demo partner with sample credentials', counts.demo ? 'present' : 'none', counts.demo && deployed ? 'bad' : counts.demo ? 'info' : 'ok', counts.demo ? 'Remove it from a public server with the Demo data panel below (or npm run purge-demo).' : ''),
    ] },
    { title: 'Payments and public pages', rows: [
      row('Stripe card payments', stripeMode(cfg.stripeSecretKey), 'info'),
      row('Stripe webhook secret', cfg.stripeWebhookSecret ? 'set' : 'not set', cfg.stripeSecretKey && !cfg.stripeWebhookSecret ? 'warn' : 'info', 'Needed to mark invoices paid automatically.'),
      row('Public fee page (PUBLIC_FEES)', cfg.publicFees ? 'on' : 'off'),
      row('Public partner application (PUBLIC_APPLY)', cfg.publicApply ? 'on' : 'off'),
    ] },
    { title: 'Credential files', rows: storage.durable ? [
      row('Durable file store', 'on (PostgreSQL)', 'ok', 'PDFs and logos are kept in the database and survive redeploys.'),
      row('Files stored', `${storage.files} (${mb(storage.bytes)})`),
      row('Files only on disk', String(storage.diskOnly), storage.diskOnly ? 'warn' : 'ok', storage.diskOnly ? 'Copy them now (button below); this also happens at every start.' : ''),
      row('Records whose file is missing everywhere', String(storage.missing.length), storage.missing.length ? 'bad' : 'ok',
        storage.missing.length ? 'These files are not regenerated automatically: historical credentials keep their original file or none. Decide case by case.' : ''),
    ] : [row('Durable file store', 'off: table missing', 'bad', 'Restart the app (the schema is applied at start) or run "npm run migrate"; the server log shows any error. Until then files are kept on disk only and are lost at the next redeploy.')] },
    { title: 'Database', rows: [
      row('PostgreSQL', counts.pg),
      row('Database size', mb(Number(counts.db_bytes))),
      row('Backups', 'managed by the hosting provider', 'info', 'Confirm automatic backups, keep a monthly off-platform export and test one restore (docs/BUILD-PLAN.md 0.8).'),
    ] },
  ];
  return { sections, storage };
}

module.exports = { collect, gitVersion, stripeMode };
